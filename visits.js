/* ============================================================
   visits.js - إدارة الزيارات (مع تعديل الوصفات)
   ============================================================ */
'use strict';

/* ------------------------------------------------------------
   ✅ رسم قائمة الوصفات — يعتمد على addPrescriptionToUI
   ------------------------------------------------------------ */
function renderPrescriptionList() {
    const container = $('prescriptionListContainer');
    if (!container) return;
    container.innerHTML = '';
    const list = window.AppState.currentPrescriptions || [];
    if (!list.length) {
        container.style.display = 'none';
        return;
    }
    list.forEach(med => addPrescriptionToUI(med));
}
window.renderPrescriptionList = renderPrescriptionList;

/* ------------------------------------------------------------
   ✅ إضافة دواء للوصفة مع إمكانية التعديل المضمّن
   ------------------------------------------------------------ */
function addPrescriptionToUI(med) {
    const container = $('prescriptionListContainer');
    if (!container) return;

    // منع التكرار
    if (container.querySelector(`.prescription-item[data-med-name="${CSS.escape(med.name)}"]`)) return;

    const item = document.createElement('div');
    item.className = 'prescription-item';
    item.dataset.medName = med.name;

    const syncToAppState = () => {
        const idx = window.AppState.currentPrescriptions.findIndex(p => p.name === med.name);
        if (idx >= 0) window.AppState.currentPrescriptions[idx] = { ...med };
        if (!window.AppState.editMode) setUnsavedChanges(true);
    };

    // ==== وضع العرض ====
    const viewMode = document.createElement('div');
    viewMode.className = 'prescription-view';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'prescription-name';
    nameSpan.textContent = med.name;

    const details = document.createElement('div');
    details.className = 'med-details';
    const renderDetails = () => {
        details.textContent = [med.dose, med.frequency, med.duration].filter(Boolean).join(' | ') || '— لا توجد تفاصيل —';
    };
    renderDetails();

    const actions = document.createElement('div');
    actions.className = 'prescription-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-sm btn-outline';
    editBtn.textContent = '✏️ تعديل';
    editBtn.setAttribute('aria-label', 'تعديل ' + med.name);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-sm btn-danger';
    removeBtn.textContent = '🗑️';
    removeBtn.setAttribute('aria-label', 'حذف ' + med.name);
    removeBtn.onclick = () => {
        window.AppState.currentPrescriptions =
            window.AppState.currentPrescriptions.filter(p => p.name !== med.name);
        item.remove();
        container.style.display = window.AppState.currentPrescriptions.length ? 'block' : 'none';
        if (!window.AppState.editMode) setUnsavedChanges(true);
    };

    actions.appendChild(editBtn);
    actions.appendChild(removeBtn);

    viewMode.appendChild(nameSpan);
    viewMode.appendChild(details);
    viewMode.appendChild(actions);

    // ==== وضع التعديل ====
    const editModeEl = document.createElement('div');
    editModeEl.className = 'prescription-edit hidden';
    editModeEl.innerHTML = `
        <div class="prescription-edit-header">
            <strong>💊 ${AppUtils.sanitize(med.name)}</strong>
        </div>
        <div class="grid-3">
            <div>
                <label>الجرعة</label>
                <input type="text" class="edit-dose" value="${AppUtils.sanitizeAttribute(med.dose || '')}" placeholder="مثال: 500mg">
            </div>
            <div>
                <label>التكرار</label>
                <input type="text" class="edit-frequency" value="${AppUtils.sanitizeAttribute(med.frequency || '')}" placeholder="مثال: مرتين يومياً">
            </div>
            <div>
                <label>المدة</label>
                <input type="text" class="edit-duration" value="${AppUtils.sanitizeAttribute(med.duration || '')}" placeholder="مثال: 7 أيام">
            </div>
        </div>
        <div class="prescription-edit-actions">
            <button type="button" class="btn-sm btn-success save-edit-btn">💾 حفظ</button>
            <button type="button" class="btn-sm btn-outline cancel-edit-btn">إلغاء</button>
        </div>
    `;

    const doseIn = editModeEl.querySelector('.edit-dose');
    const freqIn = editModeEl.querySelector('.edit-frequency');
    const durIn = editModeEl.querySelector('.edit-duration');
    const saveBtn = editModeEl.querySelector('.save-edit-btn');
    const cancelBtn = editModeEl.querySelector('.cancel-edit-btn');

    editBtn.onclick = () => {
        viewMode.classList.add('hidden');
        editModeEl.classList.remove('hidden');
        setTimeout(() => doseIn.focus(), 50);
    };

    cancelBtn.onclick = () => {
        doseIn.value = med.dose || '';
        freqIn.value = med.frequency || '';
        durIn.value = med.duration || '';
        editModeEl.classList.add('hidden');
        viewMode.classList.remove('hidden');
    };

    saveBtn.onclick = () => {
        med.dose = doseIn.value.trim();
        med.frequency = freqIn.value.trim();
        med.duration = durIn.value.trim();
        renderDetails();
        syncToAppState();
        editModeEl.classList.add('hidden');
        viewMode.classList.remove('hidden');
        AppUtils.toast('✓ تم تحديث الدواء', 'success');
    };

    // Enter = حفظ، Escape = إلغاء
    editModeEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveBtn.click(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
    });

    item.appendChild(viewMode);
    item.appendChild(editModeEl);
    container.appendChild(item);
    container.style.display = 'block';
}
window.addPrescriptionToUI = addPrescriptionToUI;

/* ------------------------------------------------------------
   حفظ زيارة جديدة
   ------------------------------------------------------------ */
async function saveVisitRecord() {
    if (!window.AppState.currentPatientFileNo) {
        showMsg('visitMsg', '❌ لم يتم تحديد مريض', 'red');
        return;
    }

    const bpVal = $('vBP').value.trim();
    if (bpVal && !AppUtils.validateBP(bpVal)) {
        showMsg('visitMsg', '❌ صيغة ضغط الدم غير صالحة (مثال: 120/80)', 'red');
        $('vBP').focus();
        return;
    }

    const diag = $('vDiag').value.trim();
    if (!diag) {
        showMsg('visitMsg', '❌ حقل التشخيص مطلوب', 'red');
        $('vDiag').focus();
        return;
    }

    const saveBtn = $('saveVisitBtn');
    saveBtn.disabled = true;
    const originalText = saveBtn.textContent;
    saveBtn.textContent = '⏳ جاري الحفظ...';

    try {
        const patients = await DB.getAll('patients');
        const idx = patients.findIndex(p => p.fileNo === window.AppState.currentPatientFileNo);
        if (idx === -1) throw new Error('المريض غير موجود');

        const patient = { ...patients[idx], visits: [...(patients[idx].visits || [])] };

        const compressedImages = [];
        window.tempImagesMap.forEach(val => {
            if (val && val.dataURL) compressedImages.push(val.dataURL);
            else if (typeof val === 'string') compressedImages.push(val);
        });

        const visitId = AppUtils.generateId();
        let imageIds = [];
        let useFallbackImages = [];

        if (compressedImages.length) {
            showProgress('imageProgress', 50);
            if (DB.useLocalFallback) {
                useFallbackImages = compressedImages.slice();
            } else {
                imageIds = await DB.saveVisitImages(visitId, compressedImages);
            }
            showProgress('imageProgress', 100);
        }

        const nextReviewDate = $('vNextDate').value;
        const nextReviewTime = $('vNextTime').value || '10:00';
        let reviewAppointmentId = null;
        let newAppointment = null;

        if (nextReviewDate) {
            newAppointment = {
                id: AppUtils.nextNumericId(),
                fileNo: patient.fileNo,
                patientName: patient.name,
                patientAge: patient.age,
                clinic: patient.clinic,
                date: nextReviewDate,
                time: nextReviewTime,
                reason: 'مراجعة: ' + diag,
                type: 'review',
                status: 'قادم',
                createdAt: AppUtils.nowISO()
            };
            reviewAppointmentId = newAppointment.id;
        }

        const visitDate = $('vDate').value || AppUtils.todayISO();

        const visitData = {
            id: visitId,
            type: $('visitType').value === 'new' ? 'معاينة' : 'مراجعة',
            bp: $('vBP').value || '',
            pulse: $('vPulse').value || '',
            spo2: $('vSpO2').value || '',
            temp: $('vTemp').value || '',
            weight: $('vWeight').value || '',
            diag: diag,
            notes: $('vNotes').value || '',
            nextReviewDate,
            nextReviewTime,
            reviewAppointmentId,
            date: visitDate,
            imageIds: DB.useLocalFallback ? [] : imageIds,
            images: useFallbackImages,
            prescriptions: window.AppState.currentPrescriptions.map(p => ({ ...p }))
        };

        patient.visits.push(visitData);
        patient.lastVisit = visitDate;
        patients[idx] = patient;

        const appointments = await DB.getAll('appointments');
        if (newAppointment) appointments.push(newAppointment);

        await DB.atomicSave({ patients, appointments });
        await DB.addAuditLog('حفظ زيارة', `تم حفظ زيارة للمريض: ${patient.name}`, patient.fileNo);

        showMsg('visitMsg', '✔ تم حفظ الزيارة بنجاح', 'green');
        AppUtils.toast('تم حفظ الزيارة', 'success');

        setUnsavedChanges(false);
        window.AppState.currentPrescriptions = [];
        renderPrescriptionList();
        resetTempImages();

        const successDiv = $('visitSuccessActions');
        if (successDiv) {
            successDiv.classList.remove('hidden');
            successDiv.innerHTML = `
                <button class="btn btn-outline" id="newVisitAfterSaveBtn" type="button">📝 زيارة جديدة</button>
                <button class="btn" id="viewPatientAfterSaveBtn" type="button">📋 عرض ملف المريض</button>
            `;
            $('newVisitAfterSaveBtn').onclick = () => {
                successDiv.classList.add('hidden');
                window.resetVisitPage && window.resetVisitPage();
            };
            $('viewPatientAfterSaveBtn').onclick = () => {
                successDiv.classList.add('hidden');
                openPatientFile(window.AppState.currentPatientFileNo);
            };
        }

        if ($('page-appointments')?.classList.contains('active')) {
            await updateCalendarDots();
            if (selectedDay) await showDayDetails(selectedDay);
        }
    } catch (err) {
        AppUtils.showError('فشل حفظ الزيارة: ' + err.message);
        console.error(err);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
}
window.saveVisitRecord = saveVisitRecord;

/* ------------------------------------------------------------
   فتح تفاصيل زيارة للتعديل
   ------------------------------------------------------------ */
async function openVisitDetail(fileNo, index) {
    const patients = await DB.getAll('patients');
    const p = patients.find(x => x.fileNo === fileNo);
    if (!p?.visits?.[index]) return;

    window.AppState.viewingVisit = { fileNo, index };
    const v = p.visits[index];

    let images = [];
    if (!DB.useLocalFallback && v.imageIds?.length) {
        const loaded = await DB.getVisitImages(v.imageIds);
        images = loaded.filter(Boolean);
    } else if (v.images?.length) {
        images = v.images.slice();
    }

    window.editingImagesMap.clear();
    images.forEach(dataURL => {
        window.editingImagesMap.set(AppUtils.generateId(), { dataURL });
    });

    // ✅ نسخة من الوصفات للتعديل المؤقت
    window._evEditingPrescriptions = (v.prescriptions || []).map(p => ({ ...p }));

    let html = `<div class="highlight-box">
        <strong>${AppUtils.sanitize(p.name)}</strong> (${AppUtils.sanitize(p.fileNo)}) - ${AppUtils.formatDate(v.date)}
    </div>
    <div class="grid-2">
        <div><label for="evType">نوع الزيارة</label><input id="evType" value="${AppUtils.sanitizeAttribute(v.type || '')}"></div>
        <div><label for="evBP">ضغط الدم</label><input id="evBP" value="${AppUtils.sanitizeAttribute(v.bp || '')}" inputmode="text" autocomplete="off" placeholder="120/80"></div>
        <div><label for="evPulse">النبض</label><input type="number" id="evPulse" value="${AppUtils.sanitizeAttribute(v.pulse || '')}"></div>
        <div><label for="evSpO2">SpO₂ %</label><input type="number" id="evSpO2" value="${AppUtils.sanitizeAttribute(v.spo2 || '')}"></div>
        <div><label for="evTemp">الحرارة °C</label><input type="number" id="evTemp" step="0.1" value="${AppUtils.sanitizeAttribute(v.temp || '')}"></div>
        <div><label for="evWeight">الوزن كغ</label><input type="number" id="evWeight" step="0.1" value="${AppUtils.sanitizeAttribute(v.weight || '')}"></div>
        <div><label for="evDate">التاريخ</label><input type="date" id="evDate" value="${AppUtils.sanitizeAttribute(v.date || '')}"></div>
    </div>
    <label for="evDiag">التشخيص</label><textarea id="evDiag" rows="2">${AppUtils.sanitize(v.diag || '')}</textarea>
    <label for="evNotes">ملاحظات</label><textarea id="evNotes" rows="2">${AppUtils.sanitize(v.notes || '')}</textarea>

    <div class="section-title">💊 الأدوية الموصوفة</div>
    <div class="input-group">
        <div class="search-box search-input-flex">
            <input type="text" id="evMedSearchInput" placeholder="🔍 ابحث عن دواء..." autocomplete="off">
            <div class="search-results" id="evMedSearchResults"></div>
        </div>
        <button class="btn-sm" id="evAddMedBtn" type="button">➕ إضافة</button>
    </div>
    <div class="grid-3 mt-8" id="evMedDoseFields">
        <div><label>الجرعة</label><input id="evMedDose" placeholder="500mg"></div>
        <div><label>التكرار</label><input id="evMedFrequency" placeholder="مرتين يومياً"></div>
        <div><label>المدة</label><input id="evMedDuration" placeholder="7 أيام"></div>
    </div>
    <div class="prescription-list" id="evPrescriptionList"></div>

    <div class="grid-2 mt-14">
        <div><label for="evNextDate">موعد المراجعة</label><input type="date" id="evNextDate" value="${AppUtils.sanitizeAttribute(v.nextReviewDate || '')}"></div>
        <div><label for="evNextTime">الوقت</label><input type="time" id="evNextTime" value="${AppUtils.sanitizeAttribute(v.nextReviewTime || '10:00')}"></div>
    </div>`;

    if (window.editingImagesMap.size) {
        html += `<label>الصور الحالية (${window.editingImagesMap.size})</label><div class="image-gallery" id="existingImagesGallery"></div>`;
    }

    html += `<div class="file-upload-options" style="margin-top:12px;">
        <button class="file-upload-btn" type="button" id="evUploadFromGalleryBtn">🖼️ رفع</button>
        <button class="file-upload-btn" type="button" id="evCaptureFromCameraBtn">📸 كاميرا</button>
        <input type="file" id="evImages" accept="image/*" multiple class="visually-hidden">
        <input type="file" id="evCamera" accept="image/*" capture="environment" class="visually-hidden">
    </div>
    <div class="image-grid" id="evImagesGrid"></div>
    <div id="evImageProgress" class="progress-bar hidden"><div class="progress-bar-fill"></div></div>
    <div class="actions-row" style="margin-top:16px;">
        <button class="btn btn-sm" id="saveVisitEditBtn" type="button">📁 حفظ التعديلات</button>
        <button class="btn btn-sm btn-danger" id="deleteVisitRecordBtn" type="button">🗑️ حذف الزيارة</button>
    </div>`;

    $('visitModalContent').innerHTML = html;
    $('visitModal').classList.remove('hidden');

    renderEditingImagesGallery();

    // ✅ ربط تعديل الوصفات في المودال
    const renderEvPrescriptions = () => {
        const c = $('evPrescriptionList');
        if (!c) return;
        c.innerHTML = '';
        if (!window._evEditingPrescriptions.length) { c.style.display = 'none'; return; }

        window._evEditingPrescriptions.forEach((med, idx) => {
            const item = document.createElement('div');
            item.className = 'prescription-item';

            const info = document.createElement('div');
            info.className = 'prescription-view';
            info.innerHTML = `<div>
                <strong class="prescription-name">${AppUtils.sanitize(med.name)}</strong>
                <div class="med-details">${AppUtils.sanitize([med.dose, med.frequency, med.duration].filter(Boolean).join(' | ')) || '—'}</div>
            </div>`;

            const actions = document.createElement('div');
            actions.className = 'prescription-actions';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn-sm btn-outline';
            editBtn.textContent = '✏️';
            editBtn.setAttribute('aria-label', 'تعديل ' + med.name);

            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'btn-sm btn-danger';
            rm.textContent = '🗑️';
            rm.setAttribute('aria-label', 'حذف ' + med.name);
            rm.onclick = () => {
                window._evEditingPrescriptions.splice(idx, 1);
                renderEvPrescriptions();
            };

            actions.appendChild(editBtn);
            actions.appendChild(rm);
            info.appendChild(actions);
            item.appendChild(info);

            // حقل التعديل
            const editEl = document.createElement('div');
            editEl.className = 'prescription-edit hidden';
            editEl.innerHTML = `
                <div class="grid-3">
                    <div><label>الجرعة</label><input type="text" class="ev-dose" value="${AppUtils.sanitizeAttribute(med.dose || '')}"></div>
                    <div><label>التكرار</label><input type="text" class="ev-frequency" value="${AppUtils.sanitizeAttribute(med.frequency || '')}"></div>
                    <div><label>المدة</label><input type="text" class="ev-duration" value="${AppUtils.sanitizeAttribute(med.duration || '')}"></div>
                </div>
                <div class="prescription-edit-actions">
                    <button type="button" class="btn-sm btn-success ev-save-btn">💾</button>
                    <button type="button" class="btn-sm btn-outline ev-cancel-btn">إلغاء</button>
                </div>`;

            const dIn = editEl.querySelector('.ev-dose');
            const fIn = editEl.querySelector('.ev-frequency');
            const duIn = editEl.querySelector('.ev-duration');

            editBtn.onclick = () => {
                info.classList.add('hidden');
                editEl.classList.remove('hidden');
                setTimeout(() => dIn.focus(), 50);
            };
            editEl.querySelector('.ev-cancel-btn').onclick = () => {
                dIn.value = med.dose || '';
                fIn.value = med.frequency || '';
                duIn.value = med.duration || '';
                editEl.classList.add('hidden');
                info.classList.remove('hidden');
            };
            editEl.querySelector('.ev-save-btn').onclick = () => {
                med.dose = dIn.value.trim();
                med.frequency = fIn.value.trim();
                med.duration = duIn.value.trim();
                renderEvPrescriptions();
                AppUtils.toast('✓ تم تحديث الدواء', 'success');
            };
            editEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); editEl.querySelector('.ev-save-btn').click(); }
                if (e.key === 'Escape') { e.preventDefault(); editEl.querySelector('.ev-cancel-btn').click(); }
            });

            item.appendChild(editEl);
            c.appendChild(item);
        });

        c.style.display = 'block';
    };
    renderEvPrescriptions();

    // بحث الأدوية في المودال
    setupMedicationSearch('evMedSearchInput', 'evMedSearchResults', (name) => {
        $('evMedSearchInput').value = name;
        $('evMedSearchResults').classList.remove('show');
    });

    $('evAddMedBtn').onclick = async () => {
        const name = $('evMedSearchInput').value.trim();
        if (!name) { AppUtils.toast('اكتب اسم الدواء', 'warning'); return; }
        if (window._evEditingPrescriptions.some(p => p.name === name)) {
            AppUtils.toast('الدواء مضاف مسبقاً', 'warning'); return;
        }
        // سجّل الدواء في القاعدة إن لم يكن موجوداً
        const meds = await DB.getMedications();
        if (!meds.some(m => m.name === name)) {
            await DB.saveMedication({ name, createdAt: AppUtils.nowISO() });
        }
        window._evEditingPrescriptions.push({
            name,
            dose: $('evMedDose').value.trim(),
            frequency: $('evMedFrequency').value.trim(),
            duration: $('evMedDuration').value.trim()
        });
        $('evMedSearchInput').value = '';
        $('evMedDose').value = '';
        $('evMedFrequency').value = '';
        $('evMedDuration').value = '';
        renderEvPrescriptions();
    };

    // أزرار الصور
    $('evUploadFromGalleryBtn').onclick = () => $('evImages').click();
    $('evCaptureFromCameraBtn').onclick = () => $('evCamera').click();
    $('evImages').onchange = async function () {
        await addImagesToGrid(this.files, 'evImagesGrid', window.editingImagesMap);
        this.value = '';
    };
    $('evCamera').onchange = async function () {
        await addImagesToGrid(this.files, 'evImagesGrid', window.editingImagesMap);
        this.value = '';
    };
    $('saveVisitEditBtn').onclick = () => {
        saveVisitEdit().catch(err => AppUtils.showError(err.message));
    };
    $('deleteVisitRecordBtn').onclick = () => {
        deleteVisitRecord().catch(err => AppUtils.showError(err.message));
    };
}
window.openVisitDetail = openVisitDetail;

function renderEditingImagesGallery() {
    const gallery = $('existingImagesGallery');
    if (!gallery) return;
    gallery.innerHTML = '';
    window.editingImagesMap.forEach((value, uid) => {
        if (!value.dataURL) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'image-thumb-wrapper';
        wrapper.dataset.uid = uid;
        const img = document.createElement('img');
        img.src = value.dataURL;
        img.className = 'image-thumb';
        img.alt = 'صورة محفوظة';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onclick = () => {
            const all = [];
            gallery.querySelectorAll('img.image-thumb').forEach(i => all.push(i.src));
            const idx = all.indexOf(img.src);
            openImageViewer(all, idx >= 0 ? idx : 0);
        };
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'remove-image';
        rm.setAttribute('aria-label', 'حذف الصورة');
        rm.innerHTML = '✖';
        rm.onclick = (ev) => {
            ev.stopPropagation();
            window.editingImagesMap.delete(uid);
            wrapper.remove();
        };
        wrapper.appendChild(img);
        wrapper.appendChild(rm);
        gallery.appendChild(wrapper);
    });
}
window.renderEditingImagesGallery = renderEditingImagesGallery;

/* ------------------------------------------------------------
   حفظ تعديلات الزيارة (مع حفظ الوصفات المعدّلة)
   ------------------------------------------------------------ */
async function saveVisitEdit() {
    if (!window.AppState.viewingVisit) return;

    const bpVal = $('evBP').value.trim();
    if (bpVal && !AppUtils.validateBP(bpVal)) {
        showMsg('visitModalMsg', '❌ صيغة ضغط الدم غير صالحة (مثال: 120/80)', 'red');
        $('evBP').focus();
        return;
    }

    const diagVal = $('evDiag').value.trim();
    if (!diagVal) {
        showMsg('visitModalMsg', '❌ حقل التشخيص مطلوب', 'red');
        $('evDiag').focus();
        return;
    }

    const saveBtn = $('saveVisitEditBtn');
    saveBtn.disabled = true;
    const origText = saveBtn.textContent;
    saveBtn.textContent = '⏳ جاري الحفظ...';

    try {
        const patients = await DB.getAll('patients');
        const pIdx = patients.findIndex(x => x.fileNo === window.AppState.viewingVisit.fileNo);
        if (pIdx < 0) return;
        const p = patients[pIdx];
        const vIdx = window.AppState.viewingVisit.index;
        if (!p.visits?.[vIdx]) return;
        const v = p.visits[vIdx];

        v.type = $('evType').value;
        v.bp = $('evBP').value;
        v.pulse = $('evPulse').value;
        v.spo2 = $('evSpO2').value;
        v.temp = $('evTemp').value;
        v.weight = $('evWeight').value;
        v.diag = diagVal;
        v.notes = $('evNotes').value;
        const newDate = $('evDate').value;
        if (newDate) v.date = newDate;

        // ✅ احفظ الوصفات المعدّلة
        v.prescriptions = (window._evEditingPrescriptions || []).map(pr => ({ ...pr }));

        const newNextDate = $('evNextDate').value;
        const newNextTime = $('evNextTime').value || '10:00';

        const finalImages = [];
        window.editingImagesMap.forEach(val => {
            if (val && val.dataURL) finalImages.push(val.dataURL);
            else if (typeof val === 'string') finalImages.push(val);
        });

        if (!DB.useLocalFallback) {
            const oldImageIds = v.imageIds?.slice() || [];
            let newImageIds = [];
            if (finalImages.length) {
                newImageIds = await DB.saveVisitImages(v.id || AppUtils.generateId(), finalImages);
            }
            if (oldImageIds.length) {
                await DB.deleteVisitImages(oldImageIds);
            }
            v.imageIds = newImageIds;
            v.images = [];
        } else {
            v.images = finalImages;
            v.imageIds = [];
        }

        const appointments = await DB.getAll('appointments');
        if (newNextDate) {
            if (v.reviewAppointmentId) {
                const appIdx = appointments.findIndex(a => a.id === v.reviewAppointmentId);
                if (appIdx >= 0) {
                    appointments[appIdx].date = newNextDate;
                    appointments[appIdx].time = newNextTime;
                    appointments[appIdx].reason = 'مراجعة: ' + diagVal;
                } else {
                    const newApp = {
                        id: AppUtils.nextNumericId(),
                        fileNo: p.fileNo,
                        patientName: p.name,
                        patientAge: p.age,
                        clinic: p.clinic,
                        date: newNextDate,
                        time: newNextTime,
                        reason: 'مراجعة: ' + diagVal,
                        type: 'review',
                        status: 'قادم',
                        createdAt: AppUtils.nowISO()
                    };
                    appointments.push(newApp);
                    v.reviewAppointmentId = newApp.id;
                }
            } else {
                const newApp = {
                    id: AppUtils.nextNumericId(),
                    fileNo: p.fileNo,
                    patientName: p.name,
                    patientAge: p.age,
                    clinic: p.clinic,
                    date: newNextDate,
                    time: newNextTime,
                    reason: 'مراجعة: ' + diagVal,
                    type: 'review',
                    status: 'قادم',
                    createdAt: AppUtils.nowISO()
                };
                appointments.push(newApp);
                v.reviewAppointmentId = newApp.id;
            }
        } else if (v.reviewAppointmentId) {
            const appIdx = appointments.findIndex(a => a.id === v.reviewAppointmentId);
            if (appIdx >= 0) appointments.splice(appIdx, 1);
            v.reviewAppointmentId = null;
        }
        v.nextReviewDate = newNextDate || '';
        v.nextReviewTime = newNextTime;

        const dates = p.visits.map(x => x.date).filter(Boolean).sort();
        p.lastVisit = dates.length ? dates[dates.length - 1] : '';

        await DB.atomicSave({ patients, appointments });
        await DB.addAuditLog('تعديل زيارة', `تم تعديل زيارة للمريض: ${p.name}`, p.fileNo);

        showMsg('visitModalMsg', '✔ تم حفظ التعديلات', 'green');
        AppUtils.toast('تم حفظ التعديلات', 'success');

        if ($('page-appointments')?.classList.contains('active')) {
            await updateCalendarDots();
            if (selectedDay) await showDayDetails(selectedDay);
        }

        const fNo = p.fileNo;
        setTimeout(() => {
            closeVisitModal();
            openPatientFile(fNo);
        }, 500);
    } catch (err) {
        AppUtils.showError(err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = origText;
    }
}
window.saveVisitEdit = saveVisitEdit;

function closeVisitModal() {
    $('visitModal')?.classList.add('hidden');
    window.AppState.viewingVisit = null;
    window.editingImagesMap.clear();
    window._evEditingPrescriptions = [];
    const grid = $('evImagesGrid');
    if (grid) grid.innerHTML = '';
    const gallery = $('existingImagesGallery');
    if (gallery) gallery.innerHTML = '';
}
window.closeVisitModal = closeVisitModal;

/* ------------------------------------------------------------
   حذف زيارة من المودال
   ------------------------------------------------------------ */
async function deleteVisitRecord() {
    if (!window.AppState.viewingVisit) return;
    const { fileNo, index } = window.AppState.viewingVisit;

    confirmAction('حذف الزيارة', 'حذف هذه الزيارة نهائياً؟', async () => {
        const patients = await DB.getAll('patients');
        const pIdx = patients.findIndex(x => x.fileNo === fileNo);
        if (pIdx < 0) return;
        const p = patients[pIdx];
        if (!p.visits?.[index]) return;

        const visit = p.visits[index];
        if (visit.imageIds?.length && !DB.useLocalFallback) {
            await DB.deleteVisitImages(visit.imageIds);
        }

        const appointments = await DB.getAll('appointments');
        if (visit.reviewAppointmentId) {
            const appIdx = appointments.findIndex(a => a.id === visit.reviewAppointmentId);
            if (appIdx >= 0) appointments.splice(appIdx, 1);
        }

        p.visits.splice(index, 1);
        const dates = p.visits.map(x => x.date).filter(Boolean).sort();
        p.lastVisit = dates.length ? dates[dates.length - 1] : '';

        await DB.atomicSave({ patients, appointments });
        await DB.addAuditLog('حذف زيارة', `تم حذف زيارة للمريض: ${p.name}`, fileNo);
        AppUtils.toast('تم حذف الزيارة', 'success');

        closeVisitModal();
        if ($('page-appointments')?.classList.contains('active')) {
            await updateCalendarDots();
            if (selectedDay) await showDayDetails(selectedDay);
        }
        if (window.AppState.currentPatientFileNo === fileNo) {
            openPatientFile(fileNo);
        }
    });
}
window.deleteVisitRecord = deleteVisitRecord;

/* ------------------------------------------------------------
   حذف زيارة من الخط الزمني
   ------------------------------------------------------------ */
async function deleteVisitRecordFromTimeline(fileNo, index) {
    confirmAction('حذف الزيارة', 'هل أنت متأكد؟ لا يمكن التراجع.', async () => {
        const patients = await DB.getAll('patients');
        const pIdx = patients.findIndex(x => x.fileNo === fileNo);
        if (pIdx < 0) return;
        const p = patients[pIdx];
        if (!p.visits?.[index]) return;

        const visit = p.visits[index];
        if (visit.imageIds?.length && !DB.useLocalFallback) {
            await DB.deleteVisitImages(visit.imageIds);
        }

        const appointments = await DB.getAll('appointments');
        if (visit.reviewAppointmentId) {
            const appIdx = appointments.findIndex(a => a.id === visit.reviewAppointmentId);
            if (appIdx >= 0) appointments.splice(appIdx, 1);
        }

        p.visits.splice(index, 1);
        const dates = p.visits.map(x => x.date).filter(Boolean).sort();
        p.lastVisit = dates.length ? dates[dates.length - 1] : '';

        await DB.atomicSave({ patients, appointments });
        await DB.addAuditLog('حذف زيارة', `تم حذف زيارة للمريض: ${p.name}`, fileNo);
        AppUtils.toast('تم حذف الزيارة', 'success');
        openPatientFile(fileNo);
    });
}
window.deleteVisitRecordFromTimeline = deleteVisitRecordFromTimeline;

/* ------------------------------------------------------------
   إضافة دواء للوصفة من النموذج الرئيسي
   ------------------------------------------------------------ */
async function addMedicationToPrescription() {
    const name = $('medSearchInput').value.trim();
    if (!name) {
        AppUtils.toast('اكتب اسم الدواء أولاً', 'warning');
        return;
    }

    const dose = $('medDose').value.trim();
    const freq = $('medFrequency').value.trim();
    const dur = $('medDuration').value.trim();

    const meds = await DB.getMedications();
    if (!meds.some(m => m.name === name)) {
        await DB.saveMedication({ name, createdAt: AppUtils.nowISO() });
    }

    if (window.AppState.currentPrescriptions.some(p => p.name === name)) {
        AppUtils.toast('الدواء مضاف مسبقاً للوصفة', 'warning');
        return;
    }

    const med = { name, dose, frequency: freq, duration: dur };
    window.AppState.currentPrescriptions.push(med);
    addPrescriptionToUI(med);

    setVal('medSearchInput', '');
    setVal('medDose', '');
    setVal('medFrequency', '');
    setVal('medDuration', '');
    hide('medDoseFields');
    $('medSearchResults')?.classList.remove('show');
    if (!window.AppState.editMode) setUnsavedChanges(true);
}
window.addMedicationToPrescription = addMedicationToPrescription;

/* ------------------------------------------------------------
   ✅ بحث الأدوية الموحّد — يعتمد على displaySearchResults العامة
   ------------------------------------------------------------ */
async function searchMedicationsAndDisplay(query, resultsDiv, onSelect) {
    if (!resultsDiv) return;
    if (!query) {
        resultsDiv.classList.remove('show');
        resultsDiv.innerHTML = '';
        return;
    }
    const meds = await DB.getMedications();
    displaySearchResults(meds, query, resultsDiv, onSelect, {
        dataAttr: 'med',
        noResultsText: 'لا توجد نتائج (سيُضاف كجديد)'
    });
}
window.searchMedicationsAndDisplay = searchMedicationsAndDisplay;

function setupMedicationSearch(inputId, resultsId, onSelect) {
    const input = $(inputId);
    const resultsDiv = $(resultsId);
    if (!input || !resultsDiv) return;

    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newInput.addEventListener('input', AppUtils.debounce(function () {
        searchMedicationsAndDisplay(this.value.trim(), resultsDiv, onSelect);
    }, 250));

    newInput.addEventListener('focus', function () {
        if (this.value.trim()) {
            searchMedicationsAndDisplay(this.value.trim(), resultsDiv, onSelect);
        }
    });
}
window.setupMedicationSearch = setupMedicationSearch;