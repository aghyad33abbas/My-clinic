/* ============================================================
   backup.js - التصدير/الاستيراد + النسخ الاحتياطي المتقدم
   ============================================================ */
'use strict';

let savedFolderHandle = null;

/* ------------------------------------------------------------
   تحميل صفحة التصدير/الاستيراد
   ------------------------------------------------------------ */
async function loadBackupPage() {
    const patients = await DB.getAll('patients');
    const months = new Set();
    patients.forEach(p => {
        if (p.lastVisit) months.add(AppUtils.getMonthYear(p.lastVisit));
        if (p.visits) p.visits.forEach(v => months.add(AppUtils.getMonthYear(v.date)));
    });

    const ms = $('exportMonth');
    if (ms) {
        ms.innerHTML = '<option value="">اختر شهراً</option>';
        Array.from(months).filter(Boolean).sort().reverse().forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            ms.appendChild(opt);
        });
    }
    updateExportSearchList(patients, '');
    toggleExportOptions();
}
window.loadBackupPage = loadBackupPage;

function updateExportSearchList(patients, query) {
    const container = $('exportSearchResults');
    if (!container) return;
    container.innerHTML = '';

    let filtered = patients;
    if (query) {
        const q = query.toLowerCase();
        filtered = patients.filter(p =>
            p.name?.toLowerCase().includes(q) || p.fileNo?.toLowerCase().includes(q)
        );
    }

    if (!filtered.length) {
        container.innerHTML = '<div style="padding:12px;text-align:center;color:var(--sub);">لا توجد نتائج</div>';
        return;
    }

    filtered.forEach(p => {
        const label = document.createElement('label');
        label.className = 'multi-select-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = p.fileNo;
        checkbox.className = 'export-checkbox';
        const span = document.createElement('span');
        span.textContent = `${p.name} (${p.fileNo}) - ${p.clinic}`;
        label.appendChild(checkbox);
        label.appendChild(span);
        container.appendChild(label);
    });
}
window.updateExportSearchList = updateExportSearchList;

function getSelectedExportPatients() {
    return Array.from(document.querySelectorAll('#exportSearchResults .export-checkbox:checked')).map(cb => cb.value);
}
window.getSelectedExportPatients = getSelectedExportPatients;

function toggleExportOptions() {
    const t = document.querySelector('input[name="exportType"]:checked')?.value;
    showIf('exportMonthlyOpt', t === 'monthly');
    showIf('exportSearchOpt', t === 'search');
}
window.toggleExportOptions = toggleExportOptions;

/* ------------------------------------------------------------
   تنفيذ التصدير
   ------------------------------------------------------------ */
async function executeExport() {
    const t = document.querySelector('input[name="exportType"]:checked')?.value;
    if (!t) return;

    const patients = await DB.getAll('patients');
    const appointments = await DB.getAll('appointments');
    const standalone = await DB.getAll('standalone');
    const medications = await DB.getMedications();
    const labTests = await DB.getLabTests();

    if (t === 'all') {
        AppUtils.downloadJSON({
            patients,
            appointments,
            standalone,
            medications,
            labTests,
            exportDate: AppUtils.todayISO(),
            version: 20
        }, 'عيادتي_' + AppUtils.todayISO() + '.json');
        await DB.addAuditLog('تصدير', 'تم تصدير كل البيانات');
    } else if (t === 'monthly') {
        const month = $('exportMonth').value;
        if (!month) {
            showMsg('backupMsg', '❌ اختر شهراً', 'red');
            return;
        }
        const filtered = patients.filter(p =>
            AppUtils.getMonthYear(p.lastVisit) === month ||
            (p.visits && p.visits.some(v => AppUtils.getMonthYear(v.date) === month))
        );
        AppUtils.downloadJSON({
            patients: filtered,
            month,
            exportDate: AppUtils.todayISO()
        }, 'عيادتي_' + month + '.json');
        await DB.addAuditLog('تصدير شهري', 'تصدير بيانات شهر: ' + month);
    } else if (t === 'search') {
        const selectedFileNos = getSelectedExportPatients();
        if (!selectedFileNos.length) {
            showMsg('backupMsg', '❌ لم يتم تحديد أي مريض', 'red');
            return;
        }
        const selected = patients.filter(p => selectedFileNos.includes(p.fileNo));
        AppUtils.downloadJSON({
            patients: selected,
            exportDate: AppUtils.todayISO()
        }, 'عيادتي_مخصص_' + AppUtils.todayISO() + '.json');
        await DB.addAuditLog('تصدير مخصص', 'تصدير ' + selected.length + ' مريض');
    }
    showMsg('backupMsg', '✔ تم التصدير', 'green');
    AppUtils.toast('تم التصدير', 'success');
}
window.executeExport = executeExport;

/* ------------------------------------------------------------
   مفاتيح الدمج
   ------------------------------------------------------------ */
function getVisitKey(v) {
    if (v.id) return 'id:' + v.id;
    return 'date:' + (v.date || '') + '|diag:' + (v.diag || '');
}
function getAppointmentKey(a) {
    if (a.id) return 'id:' + a.id;
    return 'file:' + (a.fileNo || '') + '|date:' + (a.date || '') + '|time:' + (a.time || '');
}
function getStandaloneKey(s) {
    if (s.id) return 'id:' + s.id;
    return 'name:' + (s.patientName || '') + '|date:' + (s.date || '') + '|time:' + (s.time || '');
}

function mergeVisits(existingVisits, newVisits) {
    const map = new Map();
    (existingVisits || []).forEach(v => map.set(getVisitKey(v), v));
    (newVisits || []).forEach(v => {
        const key = getVisitKey(v);
        if (!map.has(key)) {
            map.set(key, v);
        } else {
            const old = map.get(key);
            if (v.imageIds && Array.isArray(v.imageIds)) {
                old.imageIds = [...new Set([...(old.imageIds || []), ...v.imageIds])];
            }
            if (v.images && Array.isArray(v.images)) {
                old.images = [...(old.images || []), ...v.images];
            }
            if (v.date && (!old.date || v.date > old.date)) {
                Object.assign(old, v);
            }
        }
    });
    return Array.from(map.values());
}
window.mergeVisits = mergeVisits;

function mergeAppointments(existingApps, newApps) {
    const map = new Map();
    (existingApps || []).forEach(a => map.set(getAppointmentKey(a), a));
    (newApps || []).forEach(a => {
        const key = getAppointmentKey(a);
        if (!map.has(key)) {
            map.set(key, a);
        } else {
            const old = map.get(key);
            if (a.createdAt && (!old.createdAt || a.createdAt > old.createdAt)) {
                map.set(key, a);
            }
        }
    });
    return Array.from(map.values());
}
window.mergeAppointments = mergeAppointments;

function mergeStandalone(existingSta, newSta) {
    const map = new Map();
    (existingSta || []).forEach(s => map.set(getStandaloneKey(s), s));
    (newSta || []).forEach(s => {
        const key = getStandaloneKey(s);
        if (!map.has(key)) {
            map.set(key, s);
        } else {
            const old = map.get(key);
            if (s.createdAt && (!old.createdAt || s.createdAt > old.createdAt)) {
                map.set(key, s);
            }
        }
    });
    return Array.from(map.values());
}
window.mergeStandalone = mergeStandalone;

/* ------------------------------------------------------------
   دمج تحاليل المريض
   ------------------------------------------------------------ */
function mergeLabTests(existingTests, newTests) {
    const map = new Map();

    const makeKey = (t) => t.name + '|' + (t.date || '');

    (existingTests || []).forEach(t => {
        if (t && t.name) map.set(makeKey(t), t);
    });

    (newTests || []).forEach(t => {
        if (!t || !t.name) return;

        const key = makeKey(t);
        const existing = map.get(key);

        if (!existing) {
            map.set(key, t);
        } else {
            const existingScore = (existing.result ? 1 : 0) + (existing.notes ? 1 : 0);
            const newScore = (t.result ? 1 : 0) + (t.notes ? 1 : 0);
            if (newScore > existingScore) {
                map.set(key, t);
            }
        }
    });

    return Array.from(map.values());
}
window.mergeLabTests = mergeLabTests;

/* ------------------------------------------------------------
   الاستيراد
   ------------------------------------------------------------ */
async function handleImport(file) {
    if (!file) return;
    try {
        const text = await file.text();
        const d = JSON.parse(text);

        // استيراد مريض واحد
        if (d.fileNo && d.name && !d.patients) {
            const patients = await DB.getAll('patients');
            const existingIdx = patients.findIndex(p => p.fileNo === d.fileNo);

            if (existingIdx >= 0) {
                const existing = patients[existingIdx];
                if (Array.isArray(d.visits)) {
                    existing.visits = mergeVisits(existing.visits, d.visits);
                    const dates = (existing.visits || []).map(v => v.date).filter(Boolean).sort();
                    if (dates.length) existing.lastVisit = dates[dates.length - 1];
                }
                if (Array.isArray(d.labTests)) {
                    existing.labTests = mergeLabTests(existing.labTests, d.labTests);
                }
                ['name', 'age', 'gender', 'phone', 'address', 'clinic', 'status',
                 'chronic', 'surgical', 'medicationHistory', 'allergy', 'cvRisks'].forEach(field => {
                    if (d[field] !== undefined) existing[field] = d[field];
                });
            } else {
                patients.push(d);
            }

            let appointments = null;
            if (Array.isArray(d.appointments)) {
                const currentApps = await DB.getAll('appointments');
                appointments = mergeAppointments(currentApps, d.appointments);
            }

            await DB.atomicSave({ patients, appointments });
            await DB.addAuditLog('استيراد', 'استيراد بيانات مريض: ' + d.name, d.fileNo);
            showMsg('backupMsg', '✔ تم استيراد بيانات المريض والمواعيد بنجاح', 'green');
            AppUtils.toast('تم الاستيراد', 'success');
        }
        // استيراد قاعدة كاملة
        else if (d.patients || d.appointments || d.standalone || d.medications || d.labTests) {
            let patientsPayload = null;
            if (Array.isArray(d.patients)) {
                const currentPatients = await DB.getAll('patients');
                const merged = [...currentPatients];
                for (const newP of d.patients) {
                    if (!newP.fileNo) continue;
                    const existingIdx = merged.findIndex(p => p.fileNo === newP.fileNo);
                    if (existingIdx >= 0) {
                        const old = merged[existingIdx];
                        if (Array.isArray(newP.visits)) {
                            old.visits = mergeVisits(old.visits, newP.visits);
                            const dates = (old.visits || []).map(v => v.date).filter(Boolean).sort();
                            if (dates.length) old.lastVisit = dates[dates.length - 1];
                        }
                        if (Array.isArray(newP.labTests)) {
                            old.labTests = mergeLabTests(old.labTests, newP.labTests);
                        }
                        ['name', 'age', 'gender', 'phone', 'address', 'clinic', 'status',
                         'chronic', 'surgical', 'medicationHistory', 'allergy', 'cvRisks'].forEach(field => {
                            if (newP[field] !== undefined) old[field] = newP[field];
                        });
                    } else {
                        merged.push(newP);
                    }
                }
                patientsPayload = merged;
            }

            let appsPayload = null;
            if (Array.isArray(d.appointments)) {
                const currentApps = await DB.getAll('appointments');
                appsPayload = mergeAppointments(currentApps, d.appointments);
            }

            let staPayload = null;
            if (Array.isArray(d.standalone)) {
                const currentSta = await DB.getAll('standalone');
                staPayload = mergeStandalone(currentSta, d.standalone);
            }

            await DB.atomicSave({
                patients: patientsPayload,
                appointments: appsPayload,
                standalone: staPayload
            });

            if (Array.isArray(d.medications)) {
                for (const med of d.medications) {
                    if (med && med.name) await DB.saveMedication(med);
                }
            }

            if (Array.isArray(d.labTests)) {
                for (const test of d.labTests) {
                    if (test && test.name) await DB.saveLabTest(test);
                }
            }

            await DB.addAuditLog('استيراد', 'تم استيراد بيانات كاملة');
            showMsg('backupMsg', '✔ تم استيراد البيانات بنجاح', 'green');
            AppUtils.toast('تم الاستيراد', 'success');
        } else {
            throw new Error('تنسيق الملف غير معروف أو تالف');
        }

        // التحديث بعد الاستيراد
        await loadPatientsTable();
        if ($('page-appointments')?.classList.contains('active')) await renderCalendar();
        if ($('page-patientFile')?.classList.contains('active') && window.AppState.currentPatientFileNo) {
            await openPatientFile(window.AppState.currentPatientFileNo);
        }
        if ($('page-medications')?.classList.contains('active')) await loadMedicationsTable();
        if ($('page-lab-tests')?.classList.contains('active')) await loadLabTestsTable();
    } catch (err) {
        showMsg('backupMsg', '✖ فشل الاستيراد: ' + err.message, 'red');
        AppUtils.showError('فشل الاستيراد: ' + err.message);
    }
}
window.handleImport = handleImport;

/* ------------------------------------------------------------
   النسخ الاحتياطي المتقدم
   ------------------------------------------------------------ */
async function loadAdvancedBackupPage() {
    updateLastBackupDisplay();
    checkAutoBackupReminder();
    await updateStorageUsage();
}
window.loadAdvancedBackupPage = loadAdvancedBackupPage;

async function updateStorageUsage() {
    const { usage, quota } = await DB.estimateUsage();
    const textEl = $('storageUsageText');
    const barEl = $('storageUsageBar');
    if (!textEl) return;

    if (!quota) {
        textEl.textContent = 'غير متاح في هذا المتصفح';
        if (barEl) barEl.style.width = '0%';
        return;
    }
    const pct = Math.min(100, (usage / quota) * 100);
    const usageMB = (usage / 1024 / 1024).toFixed(2);
    const quotaMB = (quota / 1024 / 1024).toFixed(0);
    textEl.textContent = `المستخدم: ${usageMB} م.ب من ${quotaMB} م.ب (${pct.toFixed(1)}%)`;
    if (barEl) {
        barEl.style.width = pct + '%';
        barEl.style.background = pct > 85 ? 'var(--danger)' : pct > 65 ? 'var(--warning)' : 'var(--primary)';
    }
}
window.updateStorageUsage = updateStorageUsage;

function updateLastBackupDisplay() {
    const lastBackup = localStorage.getItem('lastBackupDate');
    const el = $('lastBackupDate');
    if (el) el.textContent = lastBackup && isValidDateString(lastBackup)
        ? AppUtils.formatDate(lastBackup)
        : 'لم تتم بعد';
}
window.updateLastBackupDisplay = updateLastBackupDisplay;

function isValidDateString(str) {
    if (!str) return false;
    const d = new Date(str);
    return !isNaN(d.getTime());
}
window.isValidDateString = isValidDateString;

function checkAutoBackupReminder() {
    const enabled = localStorage.getItem('autoBackupReminder') === 'true';
    const checkbox = $('enableAutoBackupReminder');
    if (checkbox) checkbox.checked = enabled;

    const statusEl = $('autoBackupStatus');
    if (!statusEl) return;

    if (!enabled) {
        statusEl.textContent = '';
        return;
    }

    const lastBackup = localStorage.getItem('lastBackupDate');
    if (lastBackup && isValidDateString(lastBackup)) {
        const daysSince = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince >= 3) {
            statusEl.innerHTML = '⚠️ <span style="color:var(--danger);">مر على آخر نسخة احتياطية ' + daysSince + ' يوم. يرجى عمل نسخة جديدة.</span>';
        } else {
            statusEl.textContent = '✔ آخر نسخة منذ ' + daysSince + ' يوم';
        }
    } else {
        statusEl.textContent = '⚠️ لم تقم بأي نسخة احتياطية بعد';
    }
}
window.checkAutoBackupReminder = checkAutoBackupReminder;

async function performFolderBackup() {
    if (!savedFolderHandle) throw new Error('لم يتم اختيار مجلد');
    const patients = await DB.getAll('patients');
    const appointments = await DB.getAll('appointments');
    const standalone = await DB.getAll('standalone');
    const auditLogs = await DB.getAuditLogs();   // ✅ بدون حد
    const medications = await DB.getMedications();
    const labTests = await DB.getLabTests();

    const data = {
        patients,
        appointments,
        standalone,
        auditLogs,
        medications,
        labTests,
        exportDate: AppUtils.todayISO(),
        version: 20
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const filename = 'عيادتي_نسخ_احتياطي_' + AppUtils.todayISO() + '.json';
    const fileHandle = await savedFolderHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
}
window.performFolderBackup = performFolderBackup;

/* ------------------------------------------------------------
   سجل التدقيق — بدون حد أقصى
   ------------------------------------------------------------ */
async function loadAuditLogPage() {
    // ✅ لا حد أقصى — كل السجل
    const logs = await DB.getAuditLogs();
    const tbody = $('auditLogTableBody');
    const countEl = $('auditLogCount');
    if (countEl) countEl.textContent = 'عدد السجلات: ' + logs.length;

    if (!tbody) return;
    tbody.innerHTML = '';

    if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--sub);">لا توجد سجلات تدقيق</td></tr>';
        return;
    }

    logs.forEach(log => {
        const tr = document.createElement('tr');

        const tdDate = document.createElement('td');
        tdDate.textContent = AppUtils.formatDate(log.timestamp);

        const tdAction = document.createElement('td');
        const spanAction = document.createElement('span');
        const actionBadge = log.action.includes('حذف') ? 'badge-danger'
            : log.action.includes('إضافة') ? 'badge-success'
            : log.action.includes('تعديل') ? 'badge-warning'
            : 'badge-info';
        spanAction.className = 'badge ' + actionBadge;
        spanAction.textContent = log.action;
        tdAction.appendChild(spanAction);

        const tdDetails = document.createElement('td');
        tdDetails.textContent = log.details;

        const tdTarget = document.createElement('td');
        tdTarget.textContent = log.target || '-';

        tr.appendChild(tdDate);
        tr.appendChild(tdAction);
        tr.appendChild(tdDetails);
        tr.appendChild(tdTarget);
        tbody.appendChild(tr);
    });
}
window.loadAuditLogPage = loadAuditLogPage;