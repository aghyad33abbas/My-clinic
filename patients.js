/* ============================================================
   patients.js - إدارة المرضى (مع استخدام الدوال الموحّدة)
   ============================================================ */
'use strict';

let currentPatientsPage = 1;
let filteredPatientsCache = [];
const PATIENTS_PAGE_SIZE = 50;
let visitPageOffset = 0;
const VISITS_PER_PAGE = 5;

/* ------------------------------------------------------------
   بحث المرضى
   ------------------------------------------------------------ */
async function searchPatients(query, resultsDiv, onSelect) {
    if (!resultsDiv) return;
    if (!query || !query.trim()) {
        resultsDiv.classList.remove('show');
        resultsDiv.innerHTML = '';
        return;
    }
    const results = await DB.searchPatients(query, 8);
    if (results.length) {
        resultsDiv.innerHTML = results.map(p =>
            `<div class="search-item" data-file-no="${AppUtils.sanitizeAttribute(p.fileNo)}" role="option">${AppUtils.sanitize(p.name)} (${AppUtils.sanitize(p.fileNo)}) - ${AppUtils.sanitize(p.clinic)}</div>`
        ).join('');
    } else {
        resultsDiv.innerHTML = '<div class="search-item" style="color:var(--sub);cursor:default;">لا توجد نتائج</div>';
    }
    resultsDiv.classList.add('show');
    resultsDiv._onSelect = onSelect;

    if (!resultsDiv._clickHandlerAttached) {
        resultsDiv.addEventListener('click', (e) => {
            const item = e.target.closest('.search-item');
            if (!item || !item.dataset.fileNo) return;
            const fileNo = item.dataset.fileNo;
            if (fileNo && resultsDiv._onSelect) {
                resultsDiv._onSelect(fileNo);
                resultsDiv.classList.remove('show');
                resultsDiv.innerHTML = '';
            }
        });
        resultsDiv._clickHandlerAttached = true;
    }
}
window.searchPatients = searchPatients;

/* ------------------------------------------------------------
   اختيار مريض موجود
   ------------------------------------------------------------ */
async function selectExistingPatient(fileNo) {
    const patients = await DB.getAll('patients');
    const p = patients.find(x => x.fileNo === fileNo);
    if (!p) return;

    window.AppState.currentPatientFileNo = fileNo;
    const sc = p.status === 'حالة حرجة' ? 'danger'
        : p.status === 'يحتاج متابعة' ? 'warning'
        : 'success';

    const card = $('selectedPatientCard');
    if (card) {
        card.innerHTML = `✔ <strong>${AppUtils.sanitize(p.name)}</strong> | <span class="badge badge-${sc}">${AppUtils.sanitize(p.status)}</span> | 🏥 ${AppUtils.sanitize(p.clinic)} | 📞 ${AppUtils.sanitize(p.phone || '--')}`;
        card.classList.remove('hidden');
    }
    show('selectedPatientActions');
    show('visitDetailsSection');
    setVal('vDate', AppUtils.todayISO());
    setUnsavedChanges(true);
}
window.selectExistingPatient = selectExistingPatient;

/* ------------------------------------------------------------
   جمع بيانات المريض من النموذج
   ------------------------------------------------------------ */
function collectPatientFormData() {
    const chips = document.querySelectorAll('#cvRiskChips .cv-risk-chip.selected');
    return {
        name: $('pName').value.trim(),
        age: $('pAge').value,
        gender: $('pGender').value,
        phone: $('pPhone').value.trim(),
        address: $('pAddress').value.trim(),
        clinic: $('pClinic').value,
        status: $('pStatus').value,
        chronic: $('pChronic').value.trim(),
        surgical: $('pSurgical').value.trim(),
        medicationHistory: window.AppState.currentMedHistory.join(', '),
        allergy: $('pAllergy').value.trim(),
        cvRisks: Array.from(chips).map(c => c.dataset.risk).join(', ')
    };
}
window.collectPatientFormData = collectPatientFormData;

function validatePatientForm(data) {
    const errors = [];
    if (!data.name) errors.push('الاسم الكامل مطلوب');
    if (data.phone && !AppUtils.validatePhone(data.phone)) errors.push('رقم الهاتف غير صالح');
    if (data.age && !AppUtils.validateAge(data.age)) errors.push('العمر يجب أن يكون بين 0 و 120');
    return errors;
}
window.validatePatientForm = validatePatientForm;

/* ------------------------------------------------------------
   حفظ المريض (جديد أو تحديث)
   ------------------------------------------------------------ */
async function performSavePatientOnly(form) {
    const patients = await DB.getAll('patients');

    if (window.AppState.editMode && window.AppState.editFileNo) {
        const idx = patients.findIndex(p => p.fileNo === window.AppState.editFileNo);
        if (idx < 0) {
            showMsg('patientMsg', '❌ المريض غير موجود', 'red');
            return;
        }
        Object.assign(patients[idx], form);
        await DB.saveAll('patients', patients);
        window.AppState.currentPatientFileNo = window.AppState.editFileNo;
        await DB.addAuditLog('تعديل مريض', `تم تعديل بيانات المريض: ${form.name}`, window.AppState.editFileNo);
        showMsg('patientMsg', '✔ تم تحديث بيانات المريض', 'green');
        AppUtils.toast('تم تحديث بيانات المريض', 'success');
    } else {
        const fileNo = await DB.generateFileNo();
        const np = { ...form, fileNo, lastVisit: '', visits: [], labTests: [], createdAt: AppUtils.nowISO() };
        patients.push(np);
        await DB.saveAll('patients', patients);
        window.AppState.currentPatientFileNo = np.fileNo;
        await DB.addAuditLog('إضافة مريض', `تم إضافة مريض جديد: ${form.name}`, np.fileNo);

        const startBtn = $('btnStartVisit');
        if (startBtn) startBtn.disabled = false;
        showMsg('patientMsg', '✔ تم حفظ المريض', 'green');
        AppUtils.toast('تم إضافة المريض', 'success');
    }

    const shareBtn = $('btnSharePatient');
    if (shareBtn) shareBtn.classList.remove('hidden');
    setUnsavedChanges(false);
}
window.performSavePatientOnly = performSavePatientOnly;

/* ------------------------------------------------------------
   تحديث بيانات المريض
   ------------------------------------------------------------ */
async function updatePatientData() {
    if (!window.AppState.editFileNo) return;
    const patients = await DB.getAll('patients');
    const idx = patients.findIndex(p => p.fileNo === window.AppState.editFileNo);
    if (idx < 0) return;

    const form = collectPatientFormData();
    const errors = validatePatientForm(form);
    if (errors.length) {
        showMsg('patientMsg', '❌ ' + errors.join(' | '), 'red');
        return;
    }
    Object.assign(patients[idx], form);
    await DB.saveAll('patients', patients);
    await DB.addAuditLog('تعديل مريض', 'تم تحديث البيانات: ' + patients[idx].name, window.AppState.editFileNo);
    showMsg('patientMsg', '✔ تم تحديث البيانات', 'green');
    AppUtils.toast('تم تحديث البيانات', 'success');
}
window.updatePatientData = updatePatientData;

/* ------------------------------------------------------------
   مشاركة المريض
   ------------------------------------------------------------ */
async function shareCurrentPatient() {
    if (!window.AppState.currentPatientFileNo) return;
    const patients = await DB.getAll('patients');
    const p = patients.find(x => x.fileNo === window.AppState.currentPatientFileNo);
    if (!p) return;

    const appointments = await DB.getAll('appointments');
    const patientAppointments = appointments.filter(a => a.fileNo === window.AppState.currentPatientFileNo);
    const exportData = { ...p, appointments: patientAppointments };

    if (navigator.share) {
        try {
            await navigator.share({
                title: 'بيانات مريض: ' + p.name,
                text: 'ملف ' + p.fileNo + ' - ' + p.name + ' - ' + p.clinic
            });
        } catch {
            AppUtils.downloadJSON(exportData, 'مريض_' + p.name + '_' + window.AppState.currentPatientFileNo + '.json');
        }
    } else {
        AppUtils.downloadJSON(exportData, 'مريض_' + p.name + '_' + window.AppState.currentPatientFileNo + '.json');
    }
}
window.shareCurrentPatient = shareCurrentPatient;

function cancelEditMode() {
    window.AppState.editMode = false;
    window.AppState.editFileNo = null;
    hide('editBanner');
    window.resetVisitPage && window.resetVisitPage();
}
window.cancelEditMode = cancelEditMode;

/* ------------------------------------------------------------
   حذف المريض
   ------------------------------------------------------------ */
async function deleteCurrentPatientData() {
    if (!window.AppState.currentPatientFileNo) return;
    const patients = await DB.getAll('patients');
    const p = patients.find(x => x.fileNo === window.AppState.currentPatientFileNo);
    if (!p) return;

    confirmAction('حذف', 'حذف "' + p.name + '"? لا يمكن التراجع.', async () => {
        if (p.visits) {
            const deletePromises = p.visits
                .filter(v => v.imageIds && !DB.useLocalFallback && v.imageIds.length)
                .map(v => DB.deleteVisitImages(v.imageIds));
            await Promise.all(deletePromises);
        }
        const apps = await DB.getAll('appointments');
        const filtered = apps.filter(a => a.fileNo !== window.AppState.currentPatientFileNo);
        await DB.atomicSave({
            patients: patients.filter(x => x.fileNo !== window.AppState.currentPatientFileNo),
            appointments: filtered
        });
        await DB.addAuditLog('حذف مريض', 'تم حذف المريض: ' + p.name, window.AppState.currentPatientFileNo);
        AppUtils.toast('تم حذف المريض', 'success');
        window.AppState.currentPatientFileNo = null;
        navigateTo('patients');
    });
}
window.deleteCurrentPatientData = deleteCurrentPatientData;

/* ------------------------------------------------------------
   تصدير مريض
   ------------------------------------------------------------ */
async function exportCurrentPatientData() {
    if (!window.AppState.currentPatientFileNo) return;
    const patients = await DB.getAll('patients');
    const p = patients.find(x => x.fileNo === window.AppState.currentPatientFileNo);
    if (!p) return;

    const appointments = await DB.getAll('appointments');
    const patientAppointments = appointments.filter(a => a.fileNo === window.AppState.currentPatientFileNo);
    const exportData = { ...p, appointments: patientAppointments };
    AppUtils.downloadJSON(exportData, 'مريض_' + p.name + '_' + p.fileNo + '.json');
    await DB.addAuditLog('تصدير مريض', 'تم تصدير بيانات المريض: ' + p.name, window.AppState.currentPatientFileNo);
}
window.exportCurrentPatientData = exportCurrentPatientData;

/* ------------------------------------------------------------
   جدول المرضى
   ------------------------------------------------------------ */
async function loadPatientsTable(search = '', sf = 'all', cf = 'all', page = 1) {
    const allPatients = await DB.getAll('patients');
    const filtered = allPatients.filter(p => {
        if (search) {
            const s = search.toLowerCase();
            const nameMatch = p.name?.toLowerCase().includes(s);
            const fileMatch = p.fileNo?.toLowerCase().includes(s);
            const phoneMatch = (p.phone || '').includes(search);
            if (!nameMatch && !fileMatch && !phoneMatch) return false;
        }
        if (sf !== 'all' && p.status !== sf) return false;
        if (cf !== 'all' && p.clinic !== cf) return false;
        return true;
    });
    filtered.sort((a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || ''));
    filteredPatientsCache = filtered;
    currentPatientsPage = page;

    const total = filtered.length;
    const totalPages = Math.ceil(total / PATIENTS_PAGE_SIZE) || 1;
    const start = (page - 1) * PATIENTS_PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PATIENTS_PAGE_SIZE);

    const countEl = $('patientsCount');
    if (countEl) countEl.textContent = total + ' مريض (صفحة ' + page + ' من ' + totalPages + ')';

    const tbody = $('patientsTableBody');
    if (!tbody) return;

    if (!pageItems.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--sub);">لا يوجد مرضى</td></tr>';
    } else {
        tbody.innerHTML = pageItems.map(p => {
            const sc = p.status === 'حالة حرجة' ? 'danger'
                : p.status === 'يحتاج متابعة' ? 'warning'
                : 'success';
            return '<tr>' +
                '<td><strong>' + AppUtils.sanitize(p.fileNo) + '</strong></td>' +
                '<td>' + AppUtils.sanitize(p.name) + '</td>' +
                '<td>' + AppUtils.sanitize(p.age || '-') + '</td>' +
                '<td>' + AppUtils.sanitize(p.phone || '-') + '</td>' +
                '<td>' + AppUtils.sanitize(p.clinic) + '</td>' +
                '<td><span class="badge badge-' + sc + '">' + AppUtils.sanitize(p.status) + '</span></td>' +
                '<td>' + AppUtils.formatDateShort(p.lastVisit) + '</td>' +
                '<td><button class="btn-sm open-file-btn" data-file-no="' + AppUtils.sanitizeAttribute(p.fileNo) + '" aria-label="فتح ملف المريض" type="button">📨</button></td>' +
                '</tr>';
        }).join('');
    }
    updatePatientsPagination(totalPages);
}
window.loadPatientsTable = loadPatientsTable;

function updatePatientsPagination(totalPages) {
    const container = $('patientsPagination');
    if (!container) return;
    container.innerHTML =
        '<button ' + (currentPatientsPage <= 1 ? 'disabled' : '') + ' id="prevPageBtn" type="button">السابق</button>' +
        '<span>صفحة ' + currentPatientsPage + ' من ' + totalPages + '</span>' +
        '<button ' + (currentPatientsPage >= totalPages ? 'disabled' : '') + ' id="nextPageBtn" type="button">التالي</button>';

    $('prevPageBtn')?.addEventListener('click', () => {
        if (currentPatientsPage > 1) {
            loadPatientsTable($('patientsSearch').value, $('patientsStatusFilter').value, $('patientsClinicFilter').value, currentPatientsPage - 1);
        }
    });
    $('nextPageBtn')?.addEventListener('click', () => {
        if (currentPatientsPage < totalPages) {
            loadPatientsTable($('patientsSearch').value, $('patientsStatusFilter').value, $('patientsClinicFilter').value, currentPatientsPage + 1);
        }
    });
}
window.updatePatientsPagination = updatePatientsPagination;

/* ------------------------------------------------------------
   فتح ملف المريض
   ------------------------------------------------------------ */
async function openPatientFile(fileNo) {
    const patients = await DB.getAll('patients');
    const p = patients.find(x => x.fileNo === fileNo);
    if (!p) return;

    window.AppState.currentPatientFileNo = fileNo;
    visitPageOffset = 0;
    navigateTo('patientFile');

    const sc = p.status === 'حالة حرجة' ? 'danger'
        : p.status === 'يحتاج متابعة' ? 'warning'
        : 'success';

    const medHistoryStr = p.medicationHistory
        ? `<div><strong>السوابق الدوائية:</strong> ${AppUtils.sanitize(p.medicationHistory)}</div>`
        : '';
    const cvRisksStr = p.cvRisks
        ? `<div><strong>عوامل الخطر:</strong> ${AppUtils.sanitize(p.cvRisks)}</div>`
        : '';

    const headerEl = $('patientFileHeader');
    if (headerEl) {
        headerEl.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
            <strong style="font-size:17px;">${AppUtils.sanitize(p.name)}</strong>
            <span>(${AppUtils.sanitize(p.fileNo)})</span>
            <span>${AppUtils.sanitize(p.age || '-')} سنة - ${AppUtils.sanitize(p.gender || '-')}</span>
            <span>📞 ${AppUtils.sanitize(p.phone || '--')}</span>
            <span>📍 ${AppUtils.sanitize(p.address || '--')}</span>
            <span>🏥 ${AppUtils.sanitize(p.clinic)}</span>
            <span class="badge badge-${sc}">${AppUtils.sanitize(p.status)}</span>
        </div>`;
    }

    const infoEl = $('patientMedicalInfo');
    if (infoEl) {
        infoEl.innerHTML = `<div class="grid-2">
            <div><strong>الأمراض المزمنة:</strong> ${AppUtils.sanitize(p.chronic) || 'لا يوجد'}</div>
            <div><strong>السوابق الجراحية:</strong> ${AppUtils.sanitize(p.surgical) || 'لا يوجد'}</div>
            <div><strong>حساسية دوائية:</strong> ${AppUtils.sanitize(p.allergy) || 'لا يوجد'}</div>
            ${medHistoryStr}
            ${cvRisksStr}
        </div>`;
    }

    // تحميل تحاليل المريض
    window.AppState.currentPatientLabTests = Array.isArray(p.labTests) ? [...p.labTests] : [];

    if (typeof renderPatientLabTestsList === 'function') {
        renderPatientLabTestsList();
    }
    if (typeof renderLabQuickChips === 'function') {
        renderLabQuickChips();
    }
    if (typeof toggleLabTestForm === 'function') {
        toggleLabTestForm(false);
    }

    await renderPatientVisits(p);
}
window.openPatientFile = openPatientFile;

/* ------------------------------------------------------------
   عرض الزيارات
   ------------------------------------------------------------ */
async function renderPatientVisits(p) {
    const timeline = $('patientTimeline');
    if (!timeline) return;

    clearImageGalleries();

    if (!p.visits?.length) {
        timeline.innerHTML = '<p style="color:var(--sub);text-align:center;padding:20px;">لا توجد زيارات مسجلة</p>';
        return;
    }

    const rev = [...p.visits].reverse();
    const totalVisits = rev.length;
    const paginated = rev.slice(visitPageOffset, visitPageOffset + VISITS_PER_PAGE);

    const allImageIds = [];
    paginated.forEach(v => {
        if (!DB.useLocalFallback && v.imageIds?.length) {
            allImageIds.push(...v.imageIds);
        }
    });

    const loadedImages = allImageIds.length ? await DB.getVisitImages(allImageIds) : [];

    let cursor = 0;
    const perVisitImages = paginated.map(v => {
        if (DB.useLocalFallback && v.images?.length) return v.images;
        if (!DB.useLocalFallback && v.imageIds?.length) {
            const imgs = [];
            for (let j = 0; j < v.imageIds.length; j++) {
                imgs.push(loadedImages[cursor++]);
            }
            return imgs;
        }
        return [];
    });

    let html = '';
    for (let i = 0; i < paginated.length; i++) {
        const v = paginated[i];
        const originalIndex = p.visits.length - 1 - (visitPageOffset + i);

        const images = (perVisitImages[i] || []).filter(Boolean);
        const galleryKey = images.length ? registerGallery(images) : '';

        html += `<div class="timeline-item">
            <div class="visit-header">
                <strong>${AppUtils.sanitize(v.type || 'زيارة')}</strong>
                <span>${AppUtils.formatDate(v.date)}</span>
            </div>
            <div class="visit-body">`;

        if (v.bp || v.pulse || v.spo2 || v.temp || v.weight) {
            html += `<div class="info-row">`;
            if (v.bp) html += `<span>💓 ضغط: ${AppUtils.sanitize(v.bp)}</span>`;
            if (v.pulse) html += `<span>💗 نبض: ${AppUtils.sanitize(v.pulse)}</span>`;
            if (v.spo2) html += `<span>🫁 SpO₂: ${AppUtils.sanitize(v.spo2)}%</span>`;
            if (v.temp) html += `<span>🌡️ حرارة: ${AppUtils.sanitize(v.temp)}°C</span>`;
            if (v.weight) html += `<span>⚖️ وزن: ${AppUtils.sanitize(v.weight)} كغ</span>`;
            html += `</div>`;
        }
        if (v.diag) html += `<div style="margin-top:6px;"><strong>📋 التشخيص:</strong> ${AppUtils.sanitize(v.diag)}</div>`;
        if (v.notes) html += `<div style="margin-top:4px;font-size:12px;color:var(--sub);"><strong>📝 ملاحظات:</strong> ${AppUtils.sanitize(v.notes)}</div>`;

        // ✅ عرض الوصفات بتفاصيلها الكاملة
        if (v.prescriptions?.length) {
            html += `<div style="margin-top:6px;"><strong>💊 الأدوية الموصوفة:</strong>
                <ul class="prescriptions-timeline-list">`;
            v.prescriptions.forEach(m => {
                const details = [m.dose, m.frequency, m.duration].filter(Boolean).join(' — ');
                html += `<li><strong>${AppUtils.sanitize(m.name)}</strong>${details ? ` <span style="color:var(--sub);font-size:12px;">(${AppUtils.sanitize(details)})</span>` : ''}</li>`;
            });
            html += `</ul></div>`;
        }

        if (v.nextReviewDate) {
            html += `<div style="margin-top:6px;color:var(--warning);"><strong>📮 مراجعة:</strong> ${AppUtils.formatDate(v.nextReviewDate)} الساعة ${AppUtils.sanitize(v.nextReviewTime || '10:00')}</div>`;
        }
        if (images.length) {
            html += `<div class="image-gallery">`;
            images.forEach((img, idx) => {
                html += `<img src="${AppUtils.sanitizeAttribute(img)}" data-gallery-key="${AppUtils.sanitizeAttribute(galleryKey)}" data-index="${idx}" alt="صورة ${idx + 1}" loading="lazy" decoding="async">`;
            });
            html += `</div>`;
        }
        html += `</div>
            <div class="visit-actions">
                <button class="btn-sm edit-visit-btn" data-file-no="${AppUtils.sanitizeAttribute(p.fileNo)}" data-visit-index="${originalIndex}" type="button">✏️ تعديل</button>
                <button class="btn-sm btn-danger delete-visit-btn" data-file-no="${AppUtils.sanitizeAttribute(p.fileNo)}" data-visit-index="${originalIndex}" type="button">🗑️ حذف</button>
            </div>
        </div>`;
    }

    if (totalVisits > VISITS_PER_PAGE) {
        html += `<div style="display:flex;justify-content:center;gap:10px;margin-top:12px;flex-wrap:wrap;">`;
        if (visitPageOffset > 0) {
            html += `<button class="btn-sm btn-outline" id="prevVisitsPage" type="button">◀ زيارات أحدث</button>`;
        }
        html += `<span style="font-size:13px;color:var(--sub);padding:6px 0;">${visitPageOffset + 1}-${Math.min(visitPageOffset + VISITS_PER_PAGE, totalVisits)} من ${totalVisits}</span>`;
        if (visitPageOffset + VISITS_PER_PAGE < totalVisits) {
            html += `<button class="btn-sm btn-outline" id="nextVisitsPage" type="button">زيارات أقدم ▶</button>`;
        }
        html += `</div>`;
    }

    timeline.innerHTML = html;

    $('prevVisitsPage')?.addEventListener('click', () => {
        visitPageOffset = Math.max(0, visitPageOffset - VISITS_PER_PAGE);
        renderPatientVisits(p);
    });
    $('nextVisitsPage')?.addEventListener('click', () => {
        visitPageOffset = Math.min(totalVisits - VISITS_PER_PAGE, visitPageOffset + VISITS_PER_PAGE);
        renderPatientVisits(p);
    });
}
window.renderPatientVisits = renderPatientVisits;

/* ============================================================
   المودال الشامل لتعديل بيانات المريض
   ============================================================ */
const ALL_CV_RISKS = [
    'ضغط', 'سكري', 'عمر (ذكر > 45، أنثى > 55)', 'كحول',
    'تدخين (موقف منذ أقل من 3 أشهر)', 'بدانة', 'قصة عائلية',
    'سوابق أمراض وعائية', 'اضطراب كولسترول الدم', 'اضطراب شحوم الدم'
];

async function openEditPatientModalFromFile(fileNoOverride) {
    const fileNo = fileNoOverride || window.AppState.currentPatientFileNo;
    if (!fileNo) return;

    const patients = await DB.getAll('patients');
    const p = patients.find(x => x.fileNo === fileNo);
    if (!p) return;

    window.AppState.editingPatientFileNo = fileNo;

    window.AppState.currentMedHistory = p.medicationHistory
        ? p.medicationHistory.split(',').map(m => m.trim()).filter(Boolean)
        : [];

    const selectedRisks = (p.cvRisks || '').split(',').map(r => r.trim()).filter(Boolean);

    let html = '<div class="grid-2">';
    html += '<div><label for="epName">الاسم الكامل *</label><input id="epName" value="' + AppUtils.sanitizeAttribute(p.name) + '" aria-required="true"></div>';
    html += '<div><label for="epAge">العمر</label><input type="number" id="epAge" value="' + AppUtils.sanitizeAttribute(p.age || '') + '" min="0" max="120" inputmode="numeric"></div>';
    html += '<div><label for="epGender">الجنس</label><select id="epGender"><option ' + (p.gender === 'ذكر' ? 'selected' : '') + '>ذكر</option><option ' + (p.gender === 'أنثى' ? 'selected' : '') + '>أنثى</option></select></div>';
    html += '<div><label for="epPhone">الهاتف</label><input id="epPhone" type="tel" inputmode="tel" value="' + AppUtils.sanitizeAttribute(p.phone || '') + '"></div>';
    html += '<div><label for="epAddress">العنوان</label><input id="epAddress" value="' + AppUtils.sanitizeAttribute(p.address || '') + '"></div>';
    html += '<div><label for="epClinic">العيادة *</label><select id="epClinic">';
    ['القصير', 'العقربية', 'حمص', 'شين', 'أخرى'].forEach(c => {
        html += `<option ${p.clinic === c ? 'selected' : ''}>${c}</option>`;
    });
    html += '</select></div>';
    html += '<div><label for="epStatus">الحالة</label><select id="epStatus">';
    ['مستقر', 'يحتاج متابعة', 'حالة حرجة'].forEach(s => {
        html += `<option ${p.status === s ? 'selected' : ''}>${s}</option>`;
    });
    html += '</select></div>';
    html += '</div>';

    html += '<label for="epChronic">الأمراض المزمنة</label><textarea id="epChronic" rows="2">' + AppUtils.sanitize(p.chronic || '') + '</textarea>';
    html += '<label for="epSurgical">السوابق الجراحية</label><textarea id="epSurgical" rows="2">' + AppUtils.sanitize(p.surgical || '') + '</textarea>';

    html += '<label>السوابق الدوائية</label>';
    html += '<div class="input-group">';
    html += '<div class="search-box search-input-flex"><input type="text" id="epMedHistorySearch" placeholder="🔍 ابحث عن دواء أو اكتب اسم..." autocomplete="off"><div class="search-results" id="epMedHistorySearchResults"></div></div>';
    html += '<button class="btn-sm" id="epAddMedToHistoryBtn" type="button">➕ إضافة</button>';
    html += '</div>';
    html += '<div class="med-history-list" id="epMedHistoryList"></div>';

    html += '<label for="epAllergy">حساسية دوائية</label><textarea id="epAllergy" rows="2">' + AppUtils.sanitize(p.allergy || '') + '</textarea>';

    html += '<label>عوامل الخطر القلبية الوعائية</label>';
    html += '<div class="cv-risk-chips" id="epCvRiskChips">';
    ALL_CV_RISKS.forEach(r => {
        const isSel = selectedRisks.includes(r);
        html += '<span class="cv-risk-chip' + (isSel ? ' selected' : '') + '" data-risk="' + AppUtils.sanitizeAttribute(r) + '" role="checkbox" aria-checked="' + (isSel ? 'true' : 'false') + '" tabindex="0">' + AppUtils.sanitize(r) + '</span>';
    });
    html += '</div>';
    html += '<input type="hidden" id="epCvRisks" value="' + AppUtils.sanitizeAttribute(p.cvRisks || '') + '">';

    html += '<div class="actions-row" style="margin-top:14px;">';
    html += '<button class="btn" id="saveEditPatientModalBtn" type="button">📁 حفظ التعديلات</button>';
    html += '<button class="btn btn-outline" id="cancelEditPatientModalBtn" type="button">إلغاء</button>';
    html += '</div>';

    $('editPatientModalContent').innerHTML = html;
    $('editPatientModal').classList.remove('hidden');

    renderMedHistoryList('epMedHistoryList');

    // ✅ استخدام الدالة الموحّدة لشرائح عوامل الخطر
    bindCvRiskChips('epCvRiskChips', 'epCvRisks');

    setupMedicationSearch('epMedHistorySearch', 'epMedHistorySearchResults', (name) => {
        addMedToHistoryList(name);
        renderMedHistoryList('epMedHistoryList');
    });

    $('epAddMedToHistoryBtn').onclick = () => {
        const input = $('epMedHistorySearch');
        const name = input.value.trim();
        if (name) {
            addMedToHistoryList(name);
            renderMedHistoryList('epMedHistoryList');
        }
        input.value = '';
        $('epMedHistorySearchResults').classList.remove('show');
    };

    $('saveEditPatientModalBtn').onclick = () => saveEditPatientModal(fileNo);
    $('cancelEditPatientModalBtn').onclick = closeEditPatientModal;

    setTimeout(() => $('epName')?.focus(), 100);
}
window.openEditPatientModalFromFile = openEditPatientModalFromFile;

/* ------------------------------------------------------------
   قائمة السوابق الدوائية
   ------------------------------------------------------------ */
function addMedToHistoryList(name) {
    if (!name) return;
    if (!window.AppState.currentMedHistory.includes(name)) {
        window.AppState.currentMedHistory.push(name);
    }
    DB.getMedications().then(meds => {
        if (!meds.some(m => m.name === name)) {
            DB.saveMedication({ name, createdAt: AppUtils.nowISO() });
        }
    });
}
window.addMedToHistoryList = addMedToHistoryList;

function renderMedHistoryList(containerId = 'pMedHistoryList') {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = '';
    window.AppState.currentMedHistory.forEach(name => {
        const span = document.createElement('span');
        span.className = 'med-history-tag';
        span.textContent = name;

        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-med';
        removeBtn.textContent = '✖';
        removeBtn.setAttribute('role', 'button');
        removeBtn.setAttribute('aria-label', 'حذف ' + name);
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            window.AppState.currentMedHistory = window.AppState.currentMedHistory.filter(m => m !== name);
            renderMedHistoryList(containerId);
        };

        span.appendChild(removeBtn);
        container.appendChild(span);
    });
}
window.renderMedHistoryList = renderMedHistoryList;

/* ------------------------------------------------------------
   حفظ تعديلات المريض من المودال
   ------------------------------------------------------------ */
async function saveEditPatientModal(fileNo) {
    const patients = await DB.getAll('patients');
    const idx = patients.findIndex(x => x.fileNo === fileNo);
    if (idx < 0) return;

    const name = $('epName').value.trim();
    if (!name) {
        showMsg('editPatientModalMsg', '❌ الاسم مطلوب', 'red');
        $('epName').focus();
        return;
    }
    const age = $('epAge').value;
    if (age && !AppUtils.validateAge(age)) {
        showMsg('editPatientModalMsg', '❌ العمر غير صالح (0-120)', 'red');
        $('epAge').focus();
        return;
    }
    const phone = $('epPhone').value.trim();
    if (phone && !AppUtils.validatePhone(phone)) {
        showMsg('editPatientModalMsg', '❌ رقم الهاتف غير صالح', 'red');
        $('epPhone').focus();
        return;
    }

    const p = patients[idx];
    const oldName = p.name;

    p.name = name;
    p.age = age;
    p.gender = $('epGender').value;
    p.phone = phone;
    p.address = $('epAddress').value.trim();
    p.clinic = $('epClinic').value;
    p.status = $('epStatus').value;
    p.chronic = $('epChronic').value.trim();
    p.surgical = $('epSurgical').value.trim();
    p.medicationHistory = window.AppState.currentMedHistory.join(', ');
    p.allergy = $('epAllergy').value.trim();
    p.cvRisks = $('epCvRisks').value;
    p.updatedAt = AppUtils.nowISO();

    await DB.saveAll('patients', patients);

    if (oldName !== name) {
        const apps = await DB.getAll('appointments');
        let changed = false;
        apps.forEach(a => {
            if (a.fileNo === fileNo) {
                a.patientName = name;
                a.patientAge = age;
                a.clinic = p.clinic;
                changed = true;
            }
        });
        if (changed) await DB.saveAll('appointments', apps);
    }

    await DB.addAuditLog('تعديل مريض', 'تم تعديل بيانات المريض: ' + name, fileNo);
    AppUtils.toast('تم حفظ التعديلات', 'success');

    closeEditPatientModal();

    if (window.AppState.currentPatientFileNo === fileNo) {
        await openPatientFile(fileNo);
    }
    if ($('page-patients')?.classList.contains('active')) {
        loadPatientsTable($('patientsSearch').value, $('patientsStatusFilter').value, $('patientsClinicFilter').value, currentPatientsPage);
    }
}
window.saveEditPatientModal = saveEditPatientModal;

function closeEditPatientModal() {
    $('editPatientModal')?.classList.add('hidden');
    $('editPatientModalContent').innerHTML = '';
    $('editPatientModalMsg').textContent = '';
    window.AppState.editingPatientFileNo = null;
}
window.closeEditPatientModal = closeEditPatientModal;