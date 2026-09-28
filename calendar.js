/* ============================================================
   calendar.js - التقويم والمواعيد
   ============================================================ */
'use strict';

let calYear, calMonth, selectedDay;
let currentCalendarMonth = null;

/* ------------------------------------------------------------
   بناء هيكل التقويم
   ------------------------------------------------------------ */
async function buildCalendarStructure() {
    const container = $('calendarWidget');
    if (!container) return;

    const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const dayNames = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = AppUtils.todayISO();

    let html = '<div class="calendar-header">' +
        '<button id="prevMonthBtn" type="button" aria-label="الشهر السابق">◀</button>' +
        '<h3>' + monthNames[calMonth] + ' ' + calYear + '</h3>' +
        '<button id="nextMonthBtn" type="button" aria-label="الشهر التالي">▶</button>' +
        '</div><div class="calendar-grid" id="calendarGridContent">';

    html += dayNames.map(d => '<div class="calendar-day-header">' + d + '</div>').join('');

    for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = calYear + '-' + String(calMonth + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        const isToday = dateStr === today;
        html += '<div class="calendar-day" data-date="' + dateStr + '" role="button" tabindex="0">' +
            '<div class="day-num">' + day + (isToday ? '<span class="today-label">اليوم</span>' : '') + '</div>' +
            '<div class="day-dots"></div></div>';
    }
    html += '</div>';
    container.innerHTML = html;

    $('prevMonthBtn')?.addEventListener('click', () => navigateCalendar(calYear, calMonth - 1));
    $('nextMonthBtn')?.addEventListener('click', () => navigateCalendar(calYear, calMonth + 1));

    const gridContent = $('calendarGridContent');
    if (gridContent && !gridContent.hasAttribute('data-event-bound')) {
        gridContent.addEventListener('click', function (e) {
            const dayEl = e.target.closest('.calendar-day[data-date]');
            if (dayEl) selectCalendarDay(dayEl);
        });
        gridContent.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                const dayEl = e.target.closest('.calendar-day[data-date]');
                if (dayEl) {
                    e.preventDefault();
                    selectCalendarDay(dayEl);
                }
            }
        });
        gridContent.setAttribute('data-event-bound', 'true');
    }

    await updateCalendarDots();
}
window.buildCalendarStructure = buildCalendarStructure;

function selectCalendarDay(dayEl) {
    selectedDay = dayEl.dataset.date;
    const gridContent = $('calendarGridContent');
    gridContent?.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
    dayEl.classList.add('selected');
    showDayDetails(selectedDay);
}
window.selectCalendarDay = selectCalendarDay;

async function updateCalendarDots() {
    const linkedApps = await DB.getAll('appointments');
    const standaloneApps = await DB.getAll('standalone');

    const allApps = linkedApps.filter(a => a.status === 'قادم')
        .map(a => ({ ...a, source: 'linked' }))
        .concat(
            standaloneApps.filter(a => a.status === 'قادم')
                .map(a => ({ ...a, source: 'standalone' }))
        );

    const today = AppUtils.todayISO();

    document.querySelectorAll('.calendar-day[data-date]').forEach(dayEl => {
        const dateStr = dayEl.dataset.date;
        dayEl.classList.toggle('today', dateStr === today);
        const dayApps = allApps.filter(a => a.date === dateStr);
        let dotsHtml = '';
        if (dayApps.some(a => a.type === 'review')) dotsHtml += '<span class="dot review"></span>';
        if (dayApps.some(a => a.type === 'upcoming')) dotsHtml += '<span class="dot upcoming"></span>';
        if (dayApps.some(a => a.source === 'standalone')) dotsHtml += '<span class="dot standalone"></span>';
        const dotsContainer = dayEl.querySelector('.day-dots');
        if (dotsContainer) dotsContainer.innerHTML = dotsHtml;
    });
}
window.updateCalendarDots = updateCalendarDots;

async function renderCalendar(y, m) {
    if (y !== undefined) {
        calYear = y;
        calMonth = m;
    }
    const monthKey = calYear + '-' + calMonth;
    if (currentCalendarMonth !== monthKey) {
        await buildCalendarStructure();
        currentCalendarMonth = monthKey;
    } else {
        await updateCalendarDots();
    }
    if (selectedDay) await showDayDetails(selectedDay);
}
window.renderCalendar = renderCalendar;

function navigateCalendar(y, m) {
    if (m < 0) { y--; m = 11; }
    if (m > 11) { y++; m = 0; }
    renderCalendar(y, m);
}
window.navigateCalendar = navigateCalendar;

/* ------------------------------------------------------------
   عرض تفاصيل اليوم
   ------------------------------------------------------------ */
async function showDayDetails(dateStr) {
    const linkedApps = await DB.getAll('appointments');
    const standaloneApps = await DB.getAll('standalone');

    const allApps = linkedApps
        .filter(a => a.date === dateStr && a.status === 'قادم')
        .map(a => ({ ...a, source: 'linked' }))
        .concat(
            standaloneApps
                .filter(a => a.date === dateStr && a.status === 'قادم')
                .map(a => ({ ...a, source: 'standalone' }))
        );

    allApps.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    const container = $('dayDetailsContainer');
    if (!container) return;

    if (!allApps.length) {
        container.innerHTML = '<div class="section-title">📋 ' + AppUtils.formatDate(dateStr) +
            '</div><div class="empty-state"><p>✔ لا توجد مواعيد</p></div>';
        return;
    }

    const clinicsMap = {};
    allApps.forEach(a => {
        const c = a.clinic || 'غير محدد';
        if (!clinicsMap[c]) clinicsMap[c] = [];
        clinicsMap[c].push(a);
    });

    let html = '<div class="section-title">📋 ' + AppUtils.formatDate(dateStr) + ' - ' + allApps.length + ' مواعيد</div>';

    for (const [clinic, apps] of Object.entries(clinicsMap)) {
        html += '<div class="clinic-group"><div class="clinic-group-title">🏥 ' + AppUtils.sanitize(clinic) + ' (' + apps.length + ' مواعيد)</div>';
        apps.forEach(a => {
            const rowClass = a.source === 'standalone' ? 'standalone' : (a.type === 'review' ? 'review' : 'upcoming');
            const typeBadge = a.source === 'standalone'
                ? '<span class="badge badge-purple">📝 سريع</span>'
                : (a.type === 'review'
                    ? '<span class="badge badge-warning">📋 مراجعة</span>'
                    : '<span class="badge badge-info">📮 موعد</span>');

            html += '<div class="appointment-row ' + rowClass + '">' +
                '<div class="app-time">' + AppUtils.sanitize(a.time || '--:--') + '</div>' +
                '<div class="app-info">' +
                    '<strong>' + AppUtils.sanitize(a.patientName || '') + '</strong> ' +
                    (a.source === 'linked' && a.fileNo ? '(' + AppUtils.sanitize(a.fileNo) + ')' : '') +
                    '<span style="color:var(--sub);margin-right:8px;">' +
                        (a.patientAge ? AppUtils.sanitize(a.patientAge) + ' سنة' : '') +
                    '</span>' +
                    '<div style="font-size:11px;color:var(--sub);">' + AppUtils.sanitize(a.reason || '') + '</div>' +
                '</div>' +
                '<div class="app-actions">' + typeBadge +
                    '<button class="btn-sm btn-success complete-appointment-btn" data-source="' + AppUtils.sanitizeAttribute(a.source) + '" data-id="' + a.id + '" aria-label="إكمال" type="button">✔</button>' +
                    '<button class="btn-sm btn-danger delete-appointment-btn" data-source="' + AppUtils.sanitizeAttribute(a.source) + '" data-id="' + a.id + '" aria-label="حذف" type="button">🗑️</button>' +
                '</div></div>';
        });
        html += '</div>';
    }
    container.innerHTML = html;
}
window.showDayDetails = showDayDetails;

/* ------------------------------------------------------------
   تحميل صفحة المواعيد
   ------------------------------------------------------------ */
async function loadAppointmentsPage() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    selectedDay = AppUtils.todayISO();
    currentCalendarMonth = null;
    await renderCalendar();
}
window.loadAppointmentsPage = loadAppointmentsPage;

/* ------------------------------------------------------------
   إضافة موعد سريع
   ------------------------------------------------------------ */
async function addQuickAppointment() {
    const name = $('quickAppName').value.trim();
    const date = $('quickAppDate').value;
    const time = $('quickAppTime').value;

    if (!name || !date || !time) {
        showMsg('quickAppMsg', '❌ أكمل الحقول المطلوبة', 'red');
        return;
    }

    const apps = await DB.getAll('standalone');
    apps.push({
        id: AppUtils.nextNumericId(),
        patientName: name,
        patientAge: $('quickAppAge').value,
        patientPhone: $('quickAppPhone').value,
        clinic: $('quickAppClinic').value,
        date,
        time,
        reason: $('quickAppReason').value || 'موعد سريع',
        status: 'قادم',
        source: 'standalone',
        type: 'upcoming',
        createdAt: AppUtils.nowISO()
    });
    await DB.saveAll('standalone', apps);
    await DB.addAuditLog('إضافة موعد سريع', 'تم إضافة موعد سريع: ' + name + ' بتاريخ ' + date);
    showMsg('quickAppMsg', '✔ تم الإضافة', 'green');
    AppUtils.toast('تم إضافة الموعد السريع', 'success');

    ['quickAppName', 'quickAppAge', 'quickAppPhone', 'quickAppDate', 'quickAppReason']
        .forEach(id => setVal(id, ''));
    setVal('quickAppTime', '10:00');

    await updateCalendarDots();
    if (selectedDay) await showDayDetails(selectedDay);
}
window.addQuickAppointment = addQuickAppointment;

/* ------------------------------------------------------------
   إكمال موعد
   ------------------------------------------------------------ */
async function completeAppointment(source, id) {
    if (source === 'linked') {
        const apps = await DB.getAll('appointments');
        const a = apps.find(x => x.id === id);
        if (a) {
            a.status = 'منتهي';
            await DB.saveAll('appointments', apps);
            await DB.addAuditLog('إكمال موعد', 'تم إكمال موعد: ' + a.patientName, a.fileNo || '');
            AppUtils.toast('تم إكمال الموعد', 'success');
        }
    } else {
        const apps = await DB.getAll('standalone');
        const a = apps.find(x => x.id === id);
        if (a) {
            a.status = 'منتهي';
            await DB.saveAll('standalone', apps);
            await DB.addAuditLog('إكمال موعد سريع', 'تم إكمال موعد سريع: ' + a.patientName);
            AppUtils.toast('تم إكمال الموعد السريع', 'success');
        }
    }
    await updateCalendarDots();
    if (selectedDay) await showDayDetails(selectedDay);
}
window.completeAppointment = completeAppointment;

/* ------------------------------------------------------------
   حذف موعد
   ------------------------------------------------------------ */
async function deleteAppointment(source, id) {
    confirmAction('حذف الموعد', 'هل أنت متأكد من حذف هذا الموعد؟', async () => {
        if (source === 'linked') {
            const apps = await DB.getAll('appointments');
            const a = apps.find(x => x.id === id);
            await DB.saveAll('appointments', apps.filter(x => x.id !== id));
            if (a) await DB.addAuditLog('حذف موعد', 'تم حذف موعد: ' + a.patientName, a.fileNo || '');
        } else {
            const apps = await DB.getAll('standalone');
            const a = apps.find(x => x.id === id);
            await DB.saveAll('standalone', apps.filter(x => x.id !== id));
            if (a) await DB.addAuditLog('حذف موعد سريع', 'تم حذف موعد سريع: ' + a.patientName);
        }
        AppUtils.toast('تم حذف الموعد', 'success');
        await updateCalendarDots();
        if (selectedDay) await showDayDetails(selectedDay);
    });
}
window.deleteAppointment = deleteAppointment;