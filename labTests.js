/* ============================================================
   labTests.js - إدارة قاعدة التحاليل + تحاليل المريض
   ============================================================ */
'use strict';

/* ------------------------------------------------------------
   قاعدة بيانات التحاليل العامة
   ------------------------------------------------------------ */
async function addLabTestToDB() {
    const name = $('newLabTestName').value.trim();
    if (!name) {
        AppUtils.toast('اكتب اسم التحليل', 'warning');
        return;
    }
    await DB.saveLabTest({ name, createdAt: AppUtils.nowISO() });
    await DB.addAuditLog('إضافة تحليل', 'تم إضافة تحليل للقاعدة: ' + name);
    showMsg('labTestsMsg', '✔ تمت إضافة التحليل', 'green');
    AppUtils.toast('تمت الإضافة', 'success');
    setVal('newLabTestName', '');
    await loadLabTestsTable();
}
window.addLabTestToDB = addLabTestToDB;

async function loadLabTestsTable() {
    const filter = ($('labTestsFilter')?.value || '').toLowerCase();
    const tests = await DB.getLabTests();
    const filtered = filter ? tests.filter(t => t.name.toLowerCase().includes(filter)) : tests;

    const tbody = $('labTestsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--sub);">لا توجد تحاليل مطابقة</td></tr>';
        return;
    }

    filtered.forEach(t => {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.textContent = t.name;

        const tdDate = document.createElement('td');
        tdDate.textContent = t.createdAt ? AppUtils.formatDate(t.createdAt) : '--';

        const tdAction = document.createElement('td');
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-sm btn-danger delete-lab-test-btn';
        delBtn.dataset.name = t.name;
        delBtn.type = 'button';
        delBtn.textContent = '🗑️';
        delBtn.setAttribute('aria-label', 'حذف ' + t.name);
        tdAction.appendChild(delBtn);

        tr.appendChild(tdName);
        tr.appendChild(tdDate);
        tr.appendChild(tdAction);
        tbody.appendChild(tr);
    });

    if (!tbody.dataset.eventBound) {
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('.delete-lab-test-btn');
            if (!btn) return;
            const name = btn.dataset.name;
            confirmAction('حذف تحليل', 'حذف "' + name + '" من القاعدة؟', async () => {
                await DB.deleteLabTest(name);
                await DB.addAuditLog('حذف تحليل', 'تم حذف تحليل من القاعدة: ' + name);
                AppUtils.toast('تم الحذف', 'success');
                await loadLabTestsTable();
                if (typeof renderLabQuickChips === 'function') await renderLabQuickChips();
            });
        });
        tbody.dataset.eventBound = 'true';
    }
}
window.loadLabTestsTable = loadLabTestsTable;

/* ------------------------------------------------------------
   ✅ البحث الموحّد عن التحاليل — يعتمد على displaySearchResults
   ------------------------------------------------------------ */
async function searchLabTestsAndDisplay(query, resultsDiv, onSelect) {
    if (!resultsDiv) return;
    if (!query) {
        resultsDiv.classList.remove('show');
        resultsDiv.innerHTML = '';
        return;
    }
    const tests = await DB.getLabTests();
    displaySearchResults(tests, query, resultsDiv, onSelect, {
        dataAttr: 'labtest',
        noResultsText: 'لا توجد نتائج (سيُضاف كجديد)'
    });
}
window.searchLabTestsAndDisplay = searchLabTestsAndDisplay;

function setupLabTestSearch(inputId, resultsId, onSelect) {
    const input = $(inputId);
    const resultsDiv = $(resultsId);
    if (!input || !resultsDiv) return;

    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newInput.addEventListener('input', AppUtils.debounce(function () {
        searchLabTestsAndDisplay(this.value.trim(), resultsDiv, onSelect);
    }, 250));

    newInput.addEventListener('focus', function () {
        if (this.value.trim()) searchLabTestsAndDisplay(this.value.trim(), resultsDiv, onSelect);
    });
}
window.setupLabTestSearch = setupLabTestSearch;

/* ------------------------------------------------------------
   إدارة تحاليل المريض - UI
   ------------------------------------------------------------ */
function toggleLabTestForm(forceOpen) {
    const form = $('patientLabTestEntry');
    if (!form) return;

    const isHidden = form.classList.contains('hidden');
    const shouldOpen = forceOpen !== undefined ? forceOpen : isHidden;

    if (shouldOpen) {
        form.classList.remove('hidden');
        const dateEl = $('patientLabTestDate');
        if (dateEl && !dateEl.value) dateEl.value = AppUtils.todayISO();
        setTimeout(() => $('patientLabTestSearch')?.focus(), 100);
    } else {
        form.classList.add('hidden');
        resetLabTestForm();
    }
}
window.toggleLabTestForm = toggleLabTestForm;

function resetLabTestForm() {
    setVal('patientLabTestSearch', '');
    setVal('patientLabTestResult', '');
    setVal('patientLabTestNotes', '');
    const dateEl = $('patientLabTestDate');
    if (dateEl) dateEl.value = AppUtils.todayISO();
    const resultEl = $('patientLabTestResult');
    if (resultEl) resultEl.dataset.fromChip = 'false';
    document.querySelectorAll('#labResultChips .lab-result-chip.selected')
        .forEach(c => c.classList.remove('selected'));
    $('patientLabTestSearchResults')?.classList.remove('show');
}
window.resetLabTestForm = resetLabTestForm;

async function renderLabQuickChips() {
    const container = $('labQuickChips');
    if (!container) return;

    const tests = await DB.getLabTests();
    const defaults = ['سكر صائم', 'CBC', 'كوليسترول', 'كرياتينين', 'HbA1c', 'TSH', 'بولينا', 'ALT'];
    const source = tests.length ? tests.map(t => t.name) : defaults;

    const seen = new Set();
    const names = [];
    source.forEach(n => {
        if (n && !seen.has(n)) { seen.add(n); names.push(n); }
    });

    const final = names.slice(0, 10);
    container.innerHTML = '';

    if (!final.length) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';

    final.forEach(name => {
        const chip = document.createElement('span');
        chip.className = 'lab-quick-chip';
        chip.textContent = name;
        chip.dataset.name = name;
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', '0');
        chip.setAttribute('title', 'إضافة ' + name);
        container.appendChild(chip);
    });
}
window.renderLabQuickChips = renderLabQuickChips;

function quickAddLabTest(name) {
    const form = $('patientLabTestEntry');
    if (form?.classList.contains('hidden')) toggleLabTestForm(true);

    setVal('patientLabTestSearch', name);
    const dateEl = $('patientLabTestDate');
    if (dateEl && !dateEl.value) dateEl.value = AppUtils.todayISO();

    setTimeout(() => $('patientLabTestResult')?.focus(), 80);
}
window.quickAddLabTest = quickAddLabTest;

function renderPatientLabTestsList() {
    const container = $('patientLabTestsList');
    if (!container) return;
    container.innerHTML = '';

    const tests = window.AppState.currentPatientLabTests || [];
    if (!tests.length) {
        container.innerHTML =
            '<div class="empty-lab-state">🧪 لا توجد تحاليل مسجلة — استخدم الأزرار أعلاه أو اضغط "➕ إضافة تحليل"</div>';
        return;
    }

    const sorted = tests
        .map((t, i) => ({ ...t, _idx: i }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    sorted.forEach(t => {
        const realIdx = t._idx;
        const item = document.createElement('div');
        item.className = 'lab-test-item';

        const info = document.createElement('div');
        info.className = 'lab-test-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'lab-test-name';
        nameEl.innerHTML = '🧪 <strong>' + AppUtils.sanitize(t.name) + '</strong>' +
            (t.date ? ' <span class="lab-test-date">' +
                AppUtils.sanitize(AppUtils.formatDateShort(t.date)) + '</span>' : '');
        info.appendChild(nameEl);

        if (t.result) {
            const res = document.createElement('div');
            res.className = 'lab-test-result';
            res.innerHTML = 'النتيجة: <strong>' + AppUtils.sanitize(t.result) + '</strong>';
            info.appendChild(res);
        }
        if (t.notes) {
            const nt = document.createElement('div');
            nt.className = 'lab-test-details';
            nt.textContent = '📝 ' + t.notes;
            info.appendChild(nt);
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-sm btn-danger lab-test-remove';
        removeBtn.textContent = '🗑️';
        removeBtn.setAttribute('aria-label', 'حذف ' + t.name);
        removeBtn.onclick = async () => {
            try {
                window.AppState.currentPatientLabTests.splice(realIdx, 1);
                renderPatientLabTestsList();
                if (window.AppState.currentPatientFileNo) {
                    await persistPatientLabTests(window.AppState.currentPatientFileNo);
                }
                AppUtils.toast('تم حذف التحليل', 'success');
            } catch (err) {
                AppUtils.showError('فشل حذف التحليل: ' + err.message);
            }
        };

        item.appendChild(info);
        item.appendChild(removeBtn);
        container.appendChild(item);
    });
}
window.renderPatientLabTestsList = renderPatientLabTestsList;

async function savePatientLabTest() {
    const name = $('patientLabTestSearch').value.trim();
    if (!name) {
        AppUtils.toast('اكتب اسم التحليل', 'warning');
        $('patientLabTestSearch')?.focus();
        return;
    }

    const result = $('patientLabTestResult').value.trim();
    const dateEl = $('patientLabTestDate');
    if (!dateEl.value) dateEl.value = AppUtils.todayISO();
    const date = dateEl.value;
    const notes = $('patientLabTestNotes').value.trim();

    const tests = await DB.getLabTests();
    if (!tests.some(t => t.name === name)) {
        await DB.saveLabTest({ name, createdAt: AppUtils.nowISO() });
    }

    if (!window.AppState.currentPatientLabTests) {
        window.AppState.currentPatientLabTests = [];
    }

    const dup = window.AppState.currentPatientLabTests.some(
        t => t.name === name && t.date === date
    );
    if (dup) {
        AppUtils.toast('هذا التحليل مسجّل بنفس التاريخ مسبقاً', 'warning');
        return;
    }

    window.AppState.currentPatientLabTests.push({ name, result, date, notes });

    if (window.AppState.currentPatientFileNo) {
        await persistPatientLabTests(window.AppState.currentPatientFileNo);
    }

    resetLabTestForm();
    setTimeout(() => $('patientLabTestSearch')?.focus(), 80);

    renderPatientLabTestsList();
    await renderLabQuickChips();
    AppUtils.toast('✓ تم إضافة التحليل', 'success');
}
window.savePatientLabTest = savePatientLabTest;

async function persistPatientLabTests(fileNo) {
    const patients = await DB.getAll('patients');
    const idx = patients.findIndex(p => p.fileNo === fileNo);
    if (idx < 0) return;
    patients[idx].labTests = window.AppState.currentPatientLabTests || [];
    patients[idx].updatedAt = AppUtils.nowISO();
    await DB.saveAll('patients', patients);
    await DB.addAuditLog('تعديل تحاليل', 'تم تحديث تحاليل المريض', fileNo);
}
window.persistPatientLabTests = persistPatientLabTests;

/* ------------------------------------------------------------
   ربط الأحداث
   ------------------------------------------------------------ */
function setupPatientLabTestEvents() {
    if (window._labTestEventsBound) return;
    window._labTestEventsBound = true;

    $('toggleLabTestFormBtn')?.addEventListener('click', () => toggleLabTestForm());

    const chips = $('labQuickChips');
    chips?.addEventListener('click', (e) => {
        const chip = e.target.closest('.lab-quick-chip');
        if (chip) quickAddLabTest(chip.dataset.name);
    });
    chips?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const chip = e.target.closest('.lab-quick-chip');
            if (chip) {
                e.preventDefault();
                quickAddLabTest(chip.dataset.name);
            }
        }
    });

    const resultChips = $('labResultChips');
    resultChips?.addEventListener('click', (e) => {
        const chip = e.target.closest('.lab-result-chip');
        if (!chip) return;
        const val = chip.dataset.value;
        const resultEl = $('patientLabTestResult');
        if (!resultEl) return;

        resultChips.querySelectorAll('.lab-result-chip.selected')
            .forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');

        if (!resultEl.value.trim() || resultEl.dataset.fromChip === 'true') {
            resultEl.value = val;
            resultEl.dataset.fromChip = 'true';
        } else {
            resultEl.value = resultEl.value + ' - ' + val;
            resultEl.dataset.fromChip = 'false';
        }
    });

    $('patientLabTestResult')?.addEventListener('input', function () {
        this.dataset.fromChip = 'false';
        document.querySelectorAll('#labResultChips .lab-result-chip.selected')
            .forEach(c => c.classList.remove('selected'));
    });

    setupLabTestSearch('patientLabTestSearch', 'patientLabTestSearchResults', (name) => {
        $('patientLabTestSearch').value = name;
        $('patientLabTestSearchResults').classList.remove('show');
        setTimeout(() => $('patientLabTestResult')?.focus(), 50);
    });

    const saveBtn = $('savePatientLabTestBtn');
    if (saveBtn) {
        saveBtn.onclick = () => {
            savePatientLabTest().catch(err => {
                AppUtils.showError('فشل حفظ التحليل: ' + err.message);
                console.error(err);
            });
        };
    }

    const cancelBtn = $('cancelPatientLabTestBtn');
    if (cancelBtn) cancelBtn.onclick = () => toggleLabTestForm(false);

    ['patientLabTestResult', 'patientLabTestNotes'].forEach(id => {
        $(id)?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                savePatientLabTest().catch(err => {
                    AppUtils.showError('فشل حفظ التحليل: ' + err.message);
                });
            }
            if (e.key === 'Escape') { e.preventDefault(); toggleLabTestForm(false); }
        });
    });
    $('patientLabTestSearch')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            $('patientLabTestResult')?.focus();
        }
        if (e.key === 'Escape') toggleLabTestForm(false);
    });
    $('patientLabTestDate')?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') toggleLabTestForm(false);
    });
}
window.setupPatientLabTestEvents = setupPatientLabTestEvents;