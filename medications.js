/* ============================================================
   medications.js - قاعدة بيانات الأدوية
   ============================================================ */
'use strict';

async function addMedicationToDB() {
    const name = $('newMedName').value.trim();
    if (!name) {
        AppUtils.toast('اكتب اسم الدواء', 'warning');
        return;
    }
    await DB.saveMedication({ name, createdAt: AppUtils.nowISO() });
    await DB.addAuditLog('إضافة دواء', 'تم إضافة دواء للقاعدة: ' + name);
    showMsg('medicationsMsg', '✔ تمت إضافة الدواء', 'green');
    AppUtils.toast('تمت الإضافة', 'success');
    setVal('newMedName', '');
    loadMedicationsTable();
}
window.addMedicationToDB = addMedicationToDB;

async function loadMedicationsTable() {
    const filter = $('medicationsFilter')?.value?.toLowerCase() || '';
    const meds = await DB.getMedications();
    const filtered = filter ? meds.filter(m => m.name.toLowerCase().includes(filter)) : meds;

    const tbody = $('medicationsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--sub);">لا توجد أدوية مطابقة</td></tr>';
        return;
    }

    filtered.forEach(m => {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.textContent = m.name;

        const tdDate = document.createElement('td');
        tdDate.textContent = m.createdAt ? AppUtils.formatDate(m.createdAt) : '--';

        const tdAction = document.createElement('td');
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-sm btn-danger delete-med-btn';
        delBtn.dataset.name = m.name;
        delBtn.setAttribute('aria-label', 'حذف ' + m.name);
        delBtn.type = 'button';
        delBtn.textContent = '🗑️';
        tdAction.appendChild(delBtn);

        tr.appendChild(tdName);
        tr.appendChild(tdDate);
        tr.appendChild(tdAction);
        tbody.appendChild(tr);
    });

    if (!tbody.dataset.eventBound) {
        tbody.addEventListener('click', async (e) => {
            const btn = e.target.closest('.delete-med-btn');
            if (!btn) return;
            const name = btn.dataset.name;
            confirmAction('حذف دواء', 'حذف "' + name + '" من القاعدة؟', async () => {
                await DB.deleteMedication(name);
                await DB.addAuditLog('حذف دواء', 'تم حذف دواء من القاعدة: ' + name);
                AppUtils.toast('تم الحذف', 'success');
                loadMedicationsTable();
            });
        });
        tbody.dataset.eventBound = 'true';
    }
}
window.loadMedicationsTable = loadMedicationsTable;