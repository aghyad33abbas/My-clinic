/* ============================================================
   app.js - منطق التطبيق الرئيسي (بدون قفل)
   ============================================================ */
'use strict';

window.AppState = {
    editMode: false,
    viewingVisit: null,
    currentPatientFileNo: null,
    editFileNo: null,
    editingPatientFileNo: null,
    isSavingPatient: false,
    currentPrescriptions: [],
    currentMedHistory: [],
    currentPatientLabTests: []
};

window.App = window.App || {};

/* ------------------------------------------------------------
   التنقل بين الصفحات
   ------------------------------------------------------------ */
function navigateTo(page) {
    const currentActive = document.querySelector('.page-section.active');
    const isLeavingVisit = currentActive && currentActive.id === 'page-visit' && page !== 'visit';
    const isEnteringVisit = page === 'visit' && (!currentActive || currentActive.id !== 'page-visit');

    if ((isLeavingVisit || isEnteringVisit) && window.hasUnsavedChanges && !window.AppState.editMode) {
        confirmAction('تغييرات غير محفوظة', 'لديك تغييرات لم تُحفظ. هل تريد المغادرة؟', () => {
            setUnsavedChanges(false);
            actuallyNavigateTo(page);
        });
        return;
    }
    actuallyNavigateTo(page);
}
window.navigateTo = navigateTo;

function actuallyNavigateTo(page) {
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    const target = $('page-' + page);
    if (target) target.classList.add('active');

    document.querySelectorAll('#sidebar button').forEach(b => {
        b.classList.remove('active');
        b.removeAttribute('aria-current');
        if (b.dataset.page === page) {
            b.classList.add('active');
            b.setAttribute('aria-current', 'page');
        }
    });

    const banner = $('unsavedChangesBanner');
    if (banner) banner.classList.toggle('show', window.hasUnsavedChanges && page === 'visit');

    if (page === 'patients') loadPatientsTable();
    else if (page === 'appointments') loadAppointmentsPage();
    else if (page === 'backup') loadBackupPage();
    else if (page === 'backup-advanced') loadAdvancedBackupPage();
    else if (page === 'audit-log') loadAuditLogPage();
    else if (page === 'medications') loadMedicationsTable();
    else if (page === 'lab-tests') loadLabTestsTable();
    else if (page === 'security') loadSecurityPage();
    else if (page === 'visit' && !window.AppState.editMode) {
        if (!window.hasUnsavedChanges) window.resetVisitPage && window.resetVisitPage();
    }
    window.scrollTo(0, 0);
}
window.actuallyNavigateTo = actuallyNavigateTo;

function switchVisitTab(tabName, btn) {
    document.querySelectorAll('#page-visit .tab-content').forEach(t => t.classList.add('hidden'));
    const target = $('visitTab-' + tabName);
    if (target) target.classList.remove('hidden');

    if (btn) {
        btn.parentElement.querySelectorAll('button').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
    }
}
window.switchVisitTab = switchVisitTab;

/* ------------------------------------------------------------
   إعادة تعيين صفحة الزيارة
   ------------------------------------------------------------ */
window.resetVisitPage = function resetVisitPage() {
    setVal('visitType', '');
    hide('searchSection');
    hide('newPatientSection');
    hide('visitDetailsSection');
    hide('selectedPatientCard');
    hide('selectedPatientActions');
    hide('editBanner');

    const saveBtn = $('btnSavePatientOnly');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '📁 حفظ';
    }
    const startBtn = $('btnStartVisit');
    if (startBtn) startBtn.disabled = true;
    hide('btnUpdatePatient');
    hide('btnSharePatient');

    window.AppState.currentPatientFileNo = null;
    window.AppState.editMode = false;
    window.AppState.editFileNo = null;
    window.AppState.isSavingPatient = false;
    window.AppState.currentPrescriptions = [];
    window.AppState.currentMedHistory = [];
    window.AppState.currentPatientLabTests = [];

    ['pName', 'pAge', 'pPhone', 'pAddress', 'pChronic', 'pSurgical', 'pAllergy', 'pMedHistorySearch']
        .forEach(id => setVal(id, ''));
    ['vBP', 'vPulse', 'vSpO2', 'vTemp', 'vWeight', 'vDiag', 'vNotes', 'vNextDate', 'vNextTime',
     'medSearchInput', 'medDose', 'medFrequency', 'medDuration', 'vDate']
        .forEach(id => setVal(id, ''));

    const presList = $('prescriptionListContainer');
    if (presList) presList.innerHTML = '';
    const medHistoryList = $('pMedHistoryList');
    if (medHistoryList) medHistoryList.innerHTML = '';

    resetTempImages();
    document.querySelectorAll('#cvRiskChips .cv-risk-chip').forEach(c => {
        c.classList.remove('selected');
        c.setAttribute('aria-checked', 'false');
    });
    setVal('pCvRisks', '');
    setUnsavedChanges(false);

    const successDiv = $('visitSuccessActions');
    if (successDiv) {
        successDiv.classList.add('hidden');
        successDiv.innerHTML = '';
    }
    hide('medDoseFields');
    hideAllSearchResults();
};

/* ------------------------------------------------------------
   تأكيد عند تغيير visitType
   ------------------------------------------------------------ */
function hasVisitFormData() {
    const fields = ['pName', 'pAge', 'pPhone', 'pAddress', 'pChronic', 'pSurgical', 'pAllergy',
                    'vBP', 'vPulse', 'vSpO2', 'vTemp', 'vWeight', 'vDiag', 'vNotes'];
    for (const id of fields) {
        const el = $(id);
        if (el && el.value && el.value.trim()) return true;
    }
    if (window.AppState.currentMedHistory.length > 0) return true;
    if (window.AppState.currentPrescriptions.length > 0) return true;
    if (window.tempImagesMap.size > 0) return true;
    const selectedChips = document.querySelectorAll('#cvRiskChips .cv-risk-chip.selected');
    if (selectedChips.length > 0) return true;
    return false;
}

function onVisitTypeChange() {
    if (window.AppState.editMode) return;

    const newType = $('visitType').value;
    const currentType = $('visitType').dataset.prevValue || '';

    if (hasVisitFormData() && currentType !== newType) {
        const prev = currentType;
        $('visitType').value = prev;

        confirmAction(
            '⚠️ تغيير نوع الزيارة',
            'لديك بيانات مدخلة. تغيير النوع سيمسحها. هل تريد المتابعة؟',
            () => {
                $('visitType').value = newType;
                $('visitType').dataset.prevValue = newType;
                applyVisitTypeChange(newType);
            }
        );
        return;
    }

    $('visitType').dataset.prevValue = newType;
    applyVisitTypeChange(newType);
}

function applyVisitTypeChange(t) {
    showIf('searchSection', t === 'existing');
    showIf('newPatientSection', t === 'new');
    hide('visitDetailsSection');
    hide('selectedPatientCard');
    hide('selectedPatientActions');
    window.AppState.currentPatientFileNo = null;

    ['pName', 'pAge', 'pPhone', 'pAddress', 'pChronic', 'pSurgical', 'pAllergy', 'pMedHistorySearch',
     'vBP', 'vPulse', 'vSpO2', 'vTemp', 'vWeight', 'vDiag', 'vNotes']
        .forEach(id => setVal(id, ''));

    window.AppState.currentMedHistory = [];
    window.AppState.currentPrescriptions = [];
    const medHistoryList = $('pMedHistoryList');
    if (medHistoryList) medHistoryList.innerHTML = '';
    const presList = $('prescriptionListContainer');
    if (presList) presList.innerHTML = '';
    resetTempImages();
    document.querySelectorAll('#cvRiskChips .cv-risk-chip.selected').forEach(c => {
        c.classList.remove('selected');
        c.setAttribute('aria-checked', 'false');
    });

    if (t === 'new') setUnsavedChanges(true);
}

/* ------------------------------------------------------------
   مستمعو التغييرات
   ------------------------------------------------------------ */
function addUnsavedChangeListeners() {
    const textFields = [
        'vBP', 'vPulse', 'vSpO2', 'vTemp', 'vWeight', 'vDiag', 'vNotes',
        'vNextDate', 'vNextTime', 'vDate',
        'pName', 'pAge', 'pPhone', 'pAddress', 'pChronic', 'pSurgical', 'pAllergy'
    ];
    textFields.forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('input', () => {
            if (!window.AppState.editMode) setUnsavedChanges(true);
        });
    });
    ['pGender', 'pStatus', 'pClinic'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('change', () => {
            if (!window.AppState.editMode) setUnsavedChanges(true);
        });
    });
}

/* ------------------------------------------------------------
   صفحة الأمان (بدون تشفير)
   ------------------------------------------------------------ */
async function loadSecurityPage() {
    const info = $('securityInfo');
    if (!info) return;

    const { usage, quota } = await DB.estimateUsage();
    const usageMB = quota ? (usage / 1024 / 1024).toFixed(2) : '—';
    const quotaMB = quota ? (quota / 1024 / 1024).toFixed(0) : '—';
    const patientCount = (await DB.getAll('patients')).length;
    const auditCount = (await DB.getAuditLogs()).length;

    info.innerHTML = `
        <div><strong>التخزين:</strong> ${DB.useLocalFallback ? '⚠️ localStorage (احتياطي)' : '✅ IndexedDB'}</div>
        <div><strong>اسم قاعدة البيانات:</strong> ${DB_NAME}</div>
        <div><strong>المساحة المستخدمة:</strong> ${usageMB} / ${quotaMB} م.ب</div>
        <div><strong>عدد المرضى:</strong> ${patientCount}</div>
        <div><strong>عدد سجلات التدقيق:</strong> ${auditCount}</div>
        <div><strong>الحماية:</strong> 🔓 البيانات محلية على جهازك فقط</div>
        <div><strong>آخر نسخة احتياطية:</strong> ${localStorage.getItem('lastBackupDate') ? AppUtils.formatDate(localStorage.getItem('lastBackupDate')) : 'لا يوجد'}</div>
    `;
}
window.loadSecurityPage = loadSecurityPage;

/* ------------------------------------------------------------
   ✅ إعادة تعيين كل بيانات التطبيق بشكل آمن
   ------------------------------------------------------------ */
async function resetAllData() {
    // 1) أغلق الاتصال وأوقف SW مؤقتاً
    try {
        if (DB.db) DB.db.close();
    } catch {}

    // 2) احذف كل قواعد البيانات المتعلقة بالتطبيق (الحالية والقديمة)
    await DB.deleteAllDatabases();

    // 3) احذف الكاش الخاص بـ Service Worker
    try {
        if ('caches' in window) {
            const names = await caches.keys();
            await Promise.all(names.map(n => caches.delete(n)));
        }
    } catch {}

    // 4) ألغِ تسجيل SW مؤقتاً (سيُعاد تسجيله تلقائياً بعد التحديث)
    try {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
        }
    } catch {}

    AppUtils.toast('تم حذف كل البيانات — جاري إعادة التشغيل...', 'success', 2000);
    setTimeout(() => {
        // أضف بارامتر لتجنب الكاش
        location.href = location.pathname + '?reset=' + Date.now();
    }, 1000);
}
window.resetAllData = resetAllData;

/* ------------------------------------------------------------
   ربط مستمعي الأحداث
   ------------------------------------------------------------ */
function setupEventListeners() {
    // التنقل
    document.querySelectorAll('#sidebar button').forEach(b => {
        b.addEventListener('click', () => navigateTo(b.dataset.page));
    });

    // تبويبات الزيارة
    document.querySelectorAll('#visitTabs button').forEach(btn => {
        btn.addEventListener('click', () => switchVisitTab(btn.dataset.visittab, btn));
    });

    // تغيير نوع الزيارة
    const visitTypeEl = $('visitType');
    if (visitTypeEl) {
        visitTypeEl.dataset.prevValue = '';
        visitTypeEl.addEventListener('change', onVisitTypeChange);
    }

    // البحث عن مريض
    $('patientSearch')?.addEventListener('input', AppUtils.debounce(function () {
        searchPatients(this.value.trim(), $('searchResults'), selectExistingPatient);
    }, 250));

    // زر تعديل المريض المختار
    $('editSelectedPatientBtn')?.addEventListener('click', () => {
        if (window.AppState.currentPatientFileNo) {
            openEditPatientModalFromFile(window.AppState.currentPatientFileNo);
        }
    });

    // حفظ المريض
    $('btnSavePatientOnly')?.addEventListener('click', async function () {
        if (window.AppState.isSavingPatient) return;
        this.disabled = true;
        this.textContent = '⏳ جاري الحفظ...';
        window.AppState.isSavingPatient = true;
        try {
            const form = collectPatientFormData();
            const errors = validatePatientForm(form);
            if (errors.length) {
                showMsg('patientMsg', '❌ ' + errors.join(' | '), 'red');
                return;
            }
            if (!window.AppState.editMode) {
                const patients = await DB.getAll('patients');
                const existing = patients.find(p => p.name.trim() === form.name);
                if (existing) {
                    showDuplicateNameDialog(form.name, () => performSavePatientOnly(form));
                    return;
                }
            }
            await performSavePatientOnly(form);
        } finally {
            this.disabled = false;
            this.textContent = '📁 حفظ';
            window.AppState.isSavingPatient = false;
        }
    });

    // بدء الزيارة
    $('btnStartVisit')?.addEventListener('click', async function () {
        if (!window.AppState.currentPatientFileNo && !window.AppState.editFileNo) {
            const form = collectPatientFormData();
            const errors = validatePatientForm(form);
            if (errors.length) {
                showMsg('patientMsg', '❌ ' + errors.join(' | '), 'red');
                return;
            }
            const patients = await DB.getAll('patients');
            const fileNo = await DB.generateFileNo();
            const np = { ...form, fileNo, lastVisit: '', visits: [], labTests: [], createdAt: AppUtils.nowISO() };
            patients.push(np);
            await DB.saveAll('patients', patients);
            window.AppState.currentPatientFileNo = np.fileNo;
            await DB.addAuditLog('إضافة مريض', 'تم إضافة مريض جديد وبدء الزيارة: ' + form.name, np.fileNo);
        } else if (window.AppState.editFileNo && !window.AppState.currentPatientFileNo) {
            await updatePatientData();
            window.AppState.currentPatientFileNo = window.AppState.editFileNo;
        }
        if (window.AppState.currentPatientFileNo) {
            hide('newPatientSection');
            hide('searchSection');
            hide('selectedPatientCard');
            hide('selectedPatientActions');
            show('visitDetailsSection');
            hide('btnSharePatient');
            setVal('vDate', AppUtils.todayISO());
            setUnsavedChanges(true);
        }
    });

    $('btnUpdatePatient')?.addEventListener('click', updatePatientData);
    $('btnSharePatient')?.addEventListener('click', shareCurrentPatient);
    $('cancelEditBtn')?.addEventListener('click', cancelEditMode);
    $('saveVisitBtn')?.addEventListener('click', saveVisitRecord);

    // الصور
    $('uploadFromGalleryBtn')?.addEventListener('click', () => $('vImages').click());
    $('captureFromCameraBtn')?.addEventListener('click', () => $('vCamera').click());
    $('vImages')?.addEventListener('change', async function () {
        await addImagesToGrid(this.files, 'visitImagesGrid', window.tempImagesMap);
        this.value = '';
        if (!window.AppState.editMode) setUnsavedChanges(true);
    });
    $('vCamera')?.addEventListener('change', async function () {
        await addImagesToGrid(this.files, 'visitImagesGrid', window.tempImagesMap);
        this.value = '';
        if (!window.AppState.editMode) setUnsavedChanges(true);
    });

    // بحث الأدوية
    setupMedicationSearch('medSearchInput', 'medSearchResults', (name) => {
        $('medSearchInput').value = name;
        show('medDoseFields');
        $('medSearchResults').classList.remove('show');
    });
    $('addMedToPrescriptionBtn')?.addEventListener('click', addMedicationToPrescription);

    setupMedicationSearch('pMedHistorySearch', 'pMedHistorySearchResults', (name) => {
        addMedToHistoryList(name);
        renderMedHistoryList('pMedHistoryList');
        if (!window.AppState.editMode) setUnsavedChanges(true);
    });
    $('addMedToHistoryBtn')?.addEventListener('click', () => {
        const input = $('pMedHistorySearch');
        const name = input.value.trim();
        if (name) {
            addMedToHistoryList(name);
            renderMedHistoryList('pMedHistoryList');
            if (!window.AppState.editMode) setUnsavedChanges(true);
        }
        input.value = '';
        $('pMedHistorySearchResults').classList.remove('show');
    });

    // ✅ شرائح عوامل الخطر — استخدام الدالة الموحّدة
    bindCvRiskChips('cvRiskChips', 'pCvRisks', () => {
        if (!window.AppState.editMode) setUnsavedChanges(true);
    });

    // فلاتر المرضى
    $('patientsSearch')?.addEventListener('input', AppUtils.debounce(function () {
        loadPatientsTable(this.value, $('patientsStatusFilter').value, $('patientsClinicFilter').value, 1);
    }, 250));
    $('patientsStatusFilter')?.addEventListener('change', function () {
        loadPatientsTable($('patientsSearch').value, this.value, $('patientsClinicFilter').value, 1);
    });
    $('patientsClinicFilter')?.addEventListener('change', function () {
        loadPatientsTable($('patientsSearch').value, $('patientsStatusFilter').value, this.value, 1);
    });

    // ملف المريض
    $('backToPatientsBtn')?.addEventListener('click', () => navigateTo('patients'));
    $('editPatientFromFileBtn')?.addEventListener('click', () => openEditPatientModalFromFile());
    $('exportCurrentPatientBtn')?.addEventListener('click', exportCurrentPatientData);
    $('deleteCurrentPatientBtn')?.addEventListener('click', deleteCurrentPatientData);
    $('closeEditPatientModalBtn')?.addEventListener('click', closeEditPatientModal);
    $('closeVisitModalBtn')?.addEventListener('click', closeVisitModal);

    // التصدير
    document.querySelectorAll('input[name="exportType"]').forEach(r => {
        r.addEventListener('change', toggleExportOptions);
    });
    $('executeExportBtn')?.addEventListener('click', executeExport);

    // الاستيراد
    $('importBtn')?.addEventListener('click', () => $('importFileInput').click());
    $('importFileInput')?.addEventListener('change', async function () {
        if (this.files[0]) await handleImport(this.files[0]);
        this.value = '';
    });
    $('importFromFileBtn')?.addEventListener('click', () => $('importAdvancedFileInput').click());
    $('importAdvancedFileInput')?.addEventListener('change', async function () {
        if (this.files[0]) {
            await handleImport(this.files[0]);
            updateLastBackupDisplay();
            await updateStorageUsage();
        }
        this.value = '';
    });

    // التصدير المخصص
    $('exportSearchInput')?.addEventListener('input', AppUtils.debounce(async function () {
        updateExportSearchList(await DB.getAll('patients'), this.value);
    }, 250));
    $('selectAllExportBtn')?.addEventListener('click', () => {
        document.querySelectorAll('#exportSearchResults .export-checkbox').forEach(cb => cb.checked = true);
    });
    $('deselectAllExportBtn')?.addEventListener('click', () => {
        document.querySelectorAll('#exportSearchResults .export-checkbox').forEach(cb => cb.checked = false);
    });

    // الحفظ في مجلد
    $('saveToFolderBtn')?.addEventListener('click', async () => {
        try {
            if (!window.showDirectoryPicker) {
                showMsg('advancedBackupMsg', '❌ متصفحك لا يدعم هذه الميزة. استخدم Chrome أو Edge.', 'red');
                return;
            }
            savedFolderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await performFolderBackup();
            showMsg('advancedBackupMsg', '✔ تم حفظ النسخة الاحتياطية', 'green');
            AppUtils.toast('تم النسخ الاحتياطي', 'success');
            show('quickBackupToFolderBtn');
            const pathEl = $('folderPathDisplay');
            if (pathEl) pathEl.textContent = '📁 المجلد: ' + savedFolderHandle.name;
            localStorage.setItem('lastBackupDate', AppUtils.todayISO());
            updateLastBackupDisplay();
            await DB.addAuditLog('نسخ احتياطي', 'حفظ نسخة في مجلد');
        } catch (err) {
            if (err.name !== 'AbortError') {
                showMsg('advancedBackupMsg', '✖ فشل: ' + err.message, 'red');
            }
        }
    });

    $('quickBackupToFolderBtn')?.addEventListener('click', async () => {
        if (!savedFolderHandle) {
            showMsg('advancedBackupMsg', '❌ اختر مجلداً أولاً', 'red');
            return;
        }
        try {
            await performFolderBackup();
            showMsg('advancedBackupMsg', '✔ تم النسخ السريع', 'green');
            AppUtils.toast('تم النسخ السريع', 'success');
            localStorage.setItem('lastBackupDate', AppUtils.todayISO());
            updateLastBackupDisplay();
            await DB.addAuditLog('نسخ احتياطي', 'نسخ احتياطي سريع');
        } catch (err) {
            showMsg('advancedBackupMsg', '✖ فشل: ' + err.message, 'red');
        }
    });

    // Google Drive
    $('downloadForDriveBtn')?.addEventListener('click', async () => {
        const patients = await DB.getAll('patients');
        const appointments = await DB.getAll('appointments');
        const standalone = await DB.getAll('standalone');
        const auditLogs = await DB.getAuditLogs();
        const medications = await DB.getMedications();
        const labTests = await DB.getLabTests();
        AppUtils.downloadJSON({
            patients,
            appointments,
            standalone,
            auditLogs,
            medications,
            labTests,
            exportDate: AppUtils.todayISO(),
            version: 20
        }, 'عيادتي_لـGoogleDrive_' + AppUtils.todayISO() + '.json');
        showMsg('advancedBackupMsg', '✔ تم التحميل', 'green');
        localStorage.setItem('lastBackupDate', AppUtils.todayISO());
        updateLastBackupDisplay();
        await DB.addAuditLog('تصدير لـ Drive', 'تحميل نسخة للرفع');
    });

    $('openGoogleDriveBtn')?.addEventListener('click', () => {
        window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener,noreferrer');
    });

    $('enableAutoBackupReminder')?.addEventListener('change', function () {
        localStorage.setItem('autoBackupReminder', this.checked ? 'true' : 'false');
        checkAutoBackupReminder();
    });

    // سجل التدقيق
    $('refreshAuditLogBtn')?.addEventListener('click', loadAuditLogPage);
    $('exportAuditLogBtn')?.addEventListener('click', async () => {
        const logs = await DB.getAuditLogs();
        AppUtils.downloadJSON(logs, 'سجل_التدقيق_' + AppUtils.todayISO() + '.json');
        showMsg('auditLogMsg', '✔ تم التصدير', 'green');
    });
    $('clearAuditLogBtn')?.addEventListener('click', () => {
        confirmAction('مسح سجل التدقيق', 'هل أنت متأكد؟ لا يمكن التراجع.', async () => {
            await DB.clearAuditLogs();
            await DB.addAuditLog('مسح السجل', 'تم مسح سجل التدقيق');
            loadAuditLogPage();
            showMsg('auditLogMsg', '✔ تم المسح', 'green');
            AppUtils.toast('تم المسح', 'success');
        });
    });

    // الأدوية
    $('addMedToDBBtn')?.addEventListener('click', addMedicationToDB);
    $('newMedName')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addMedicationToDB();
        }
    });
    $('medicationsFilter')?.addEventListener('input', AppUtils.debounce(loadMedicationsTable, 250));

    // التحاليل
    $('addLabTestToDBBtn')?.addEventListener('click', addLabTestToDB);
    $('newLabTestName')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addLabTestToDB();
        }
    });
    $('labTestsFilter')?.addEventListener('input', AppUtils.debounce(loadLabTestsTable, 250));
    setupPatientLabTestEvents();

    // موعد سريع
    $('addQuickAppointmentBtn')?.addEventListener('click', addQuickAppointment);

    // الأحداث الديناميكية (delegation)
    document.addEventListener('click', async (e) => {
        const img = e.target.closest('img[data-gallery-key]');
        if (img) {
            const key = img.dataset.galleryKey;
            const index = parseInt(img.dataset.index, 10);
            const images = window.imageGalleries.get(key);
            if (images) openImageViewer(images, index);
            return;
        }
        const editBtn = e.target.closest('.edit-visit-btn');
        if (editBtn) {
            openVisitDetail(editBtn.dataset.fileNo, parseInt(editBtn.dataset.visitIndex, 10));
            return;
        }
        const delBtn = e.target.closest('.delete-visit-btn');
        if (delBtn) {
            deleteVisitRecordFromTimeline(delBtn.dataset.fileNo, parseInt(delBtn.dataset.visitIndex, 10));
            return;
        }
        const openFileBtn = e.target.closest('.open-file-btn');
        if (openFileBtn) {
            openPatientFile(openFileBtn.dataset.fileNo);
            return;
        }
        const completeBtn = e.target.closest('.complete-appointment-btn');
        if (completeBtn) {
            completeAppointment(completeBtn.dataset.source, parseInt(completeBtn.dataset.id, 10));
            return;
        }
        const deleteAppBtn = e.target.closest('.delete-appointment-btn');
        if (deleteAppBtn) {
            deleteAppointment(deleteAppBtn.dataset.source, parseInt(deleteAppBtn.dataset.id, 10));
            return;
        }
    });

    // التثبيت
    $('installAcceptBtn')?.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') AppUtils.toast('تم تثبيت التطبيق', 'success');
            deferredPrompt = null;
            $('installPrompt')?.classList.remove('show');
        }
    });
    $('installDismissBtn')?.addEventListener('click', () => {
        $('installPrompt')?.classList.remove('show');
        localStorage.setItem('installPromptDismissed', 'true');
    });

    // ✅ حذف كل البيانات بشكل آمن
    $('forgetAllDataBtn')?.addEventListener('click', () => {
        confirmAction('⚠️ حذف كل البيانات',
            'سيتم حذف كل المرضى والمواعيد والصور والإعدادات نهائياً. لا يمكن التراجع!',
            async () => {
                await resetAllData();
            }
        );
    });
}

/* ------------------------------------------------------------
   PWA: Service Worker + Install Prompt
   ------------------------------------------------------------ */
let deferredPrompt = null;

function setupPWA() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js', { scope: './' })
                .then((reg) => {
                    console.log('✔ Service Worker مسجل', reg.scope);
                    reg.addEventListener('updatefound', () => {
                        const sw = reg.installing;
                        if (!sw) return;
                        sw.addEventListener('statechange', () => {
                            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                                AppUtils.toast('🔄 يوجد تحديث جديد — أعد تحميل الصفحة', 'info', 8000);
                            }
                        });
                    });
                })
                .catch((err) => {
                    console.warn('⚠️ فشل تسجيل Service Worker:', err.message);
                });
        });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        if (localStorage.getItem('installPromptDismissed') === 'true') return;
        deferredPrompt = e;
        $('installPrompt')?.classList.add('show');
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        $('installPrompt')?.classList.remove('show');
        AppUtils.toast('تم تثبيت التطبيق بنجاح', 'success');
    });
}

/* ------------------------------------------------------------
   بيانات تجريبية
   ------------------------------------------------------------ */
async function seedDemoDataIfEmpty() {
    const patients = await DB.getAll('patients');
    if (patients.length > 0) return;

    const f1 = await DB.generateFileNo();
    const f2 = await DB.generateFileNo();
    const today = AppUtils.todayISO();
    const nextMonth = AppUtils.addDaysISO(30);
    const nextWeek = AppUtils.addDaysISO(7);

    const demo = [
        {
            fileNo: f1,
            name: 'محمد العلي',
            age: '55',
            gender: 'ذكر',
            phone: '0999999999',
            address: 'حمص',
            clinic: 'القصير',
            status: 'مستقر',
            chronic: 'ارتفاع ضغط شرياني',
            surgical: 'لا يوجد',
            medicationHistory: 'ليسينوبريل',
            allergy: 'لا يوجد',
            cvRisks: 'ضغط, عمر (ذكر > 45، أنثى > 55)',
            lastVisit: today,
            visits: [{
                id: AppUtils.generateId(),
                type: 'معاينة',
                bp: '140/90',
                pulse: '80',
                spo2: '98',
                temp: '37',
                weight: '85',
                diag: 'ارتفاع ضغط',
                notes: '',
                prescriptions: [{ name: 'ليسينوبريل', dose: '10mg', frequency: 'مرة يومياً', duration: 'مستمر' }],
                imageIds: [],
                images: [],
                nextReviewDate: nextMonth,
                nextReviewTime: '10:00',
                date: today
            }],
            labTests: [
                { name: 'سكر صائم', result: '105 mg/dL', date: today, notes: 'مرتفع قليلاً' },
                { name: 'كولسترول', result: '220 mg/dL', date: today, notes: '' }
            ],
            createdAt: AppUtils.nowISO()
        },
        {
            fileNo: f2,
            name: 'سامر الحمود',
            age: '42',
            gender: 'ذكر',
            phone: '0988888888',
            address: 'حمص',
            clinic: 'العقربية',
            status: 'يحتاج متابعة',
            chronic: 'سكري',
            surgical: 'استئصال الزائدة',
            medicationHistory: 'ميتفورمين',
            allergy: 'بنسلين',
            cvRisks: 'سكري, تدخين (موقف منذ أقل من 3 أشهر)',
            lastVisit: '',
            visits: [],
            labTests: [],
            createdAt: AppUtils.nowISO()
        }
    ];

    const appointments = [{
        id: AppUtils.nextNumericId(),
        fileNo: f1,
        patientName: demo[0].name,
        patientAge: '55',
        clinic: 'القصير',
        date: nextMonth,
        time: '10:00',
        reason: 'مراجعة ضغط',
        type: 'review',
        status: 'قادم',
        createdAt: AppUtils.nowISO()
    }];

    const standalone = [{
        id: AppUtils.nextNumericId(),
        patientName: 'أحمد سعيد',
        patientAge: '30',
        patientPhone: '0933333333',
        clinic: 'القصير',
        date: nextWeek,
        time: '11:00',
        reason: 'استشارة',
        status: 'قادم',
        type: 'upcoming',
        source: 'standalone',
        createdAt: AppUtils.nowISO()
    }];

    await DB.atomicSave({ patients: demo, appointments, standalone });
    await DB.saveMedication({ name: 'ليسينوبريل', createdAt: AppUtils.nowISO() });
    await DB.saveMedication({ name: 'ميتفورمين', createdAt: AppUtils.nowISO() });
    await DB.saveLabTest({ name: 'سكر صائم', createdAt: AppUtils.nowISO() });
    await DB.saveLabTest({ name: 'كولسترول', createdAt: AppUtils.nowISO() });
    await DB.saveLabTest({ name: 'CBC', createdAt: AppUtils.nowISO() });
    await DB.saveLabTest({ name: 'كرياتينين', createdAt: AppUtils.nowISO() });
    await DB.addAuditLog('تهيئة', 'تم إنشاء بيانات تجريبية');
}

/* ------------------------------------------------------------
   تشغيل التطبيق
   ------------------------------------------------------------ */
App.startAfterUnlock = async function startAfterUnlock() {
    try {
        await seedDemoDataIfEmpty();
    } catch (err) {
        console.warn('فشل تحميل البيانات التجريبية:', err);
    }

    updateConnectionStatus();

    try {
        await loadPatientsTable();
    } catch (err) {
        console.warn('فشل تحميل جدول المرضى:', err);
    }

    // تذكير النسخ الاحتياطي
    if (localStorage.getItem('autoBackupReminder') === 'true') {
        const lastBackup = localStorage.getItem('lastBackupDate');
        if (lastBackup) {
            const daysSince = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince >= 3) {
                AppUtils.showError('⚠️ تذكير: مر على آخر نسخة احتياطية ' + daysSince + ' يوم.', 10000);
            }
        }
    }
};

/* ------------------------------------------------------------
   ✅ التهيئة الكاملة (بدون قفل)
   ------------------------------------------------------------ */
async function init() {
    try {
        await DB.open();
        console.log('✔ قاعدة البيانات جاهزة', DB.useLocalFallback ? '(fallback)' : '');

        updateConnectionStatus();
        setupEventListeners();
        setupPWA();
        addUnsavedChangeListeners();

        // 🚀 ابدأ التطبيق مباشرة — بدون قفل
        await App.startAfterUnlock();

        if (location.search.includes('test=1') && window.runAllTests) {
            setTimeout(() => window.runAllTests(), 1000);
        }
    } catch (e) {
        console.error('فشل تهيئة التطبيق:', e);
        AppUtils.showError('فشل في تحميل التطبيق: ' + e.message);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}