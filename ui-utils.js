/* ============================================================
   ui-utils.js - أدوات واجهة المستخدم
   - إصلاح showMsg (بدون مقارنة textContent)
   - دوال عامة للبحث (أدوية + تحاليل)
   - دالة موحّدة لشرائح عوامل الخطر
   ============================================================ */
'use strict';

/* ------------------------------------------------------------
   خرائط الصور المؤقتة
   ------------------------------------------------------------ */
window.tempImagesMap = new Map();
window.editingImagesMap = new Map();

/* ------------------------------------------------------------
   معارض الصور
   ------------------------------------------------------------ */
window.imageGalleries = new Map();
window.galleryCounter = 0;

/* ------------------------------------------------------------
   عارض الصور
   ------------------------------------------------------------ */
window.viewerImages = [];
window.viewerIndex = 0;
let viewerLastFocused = null;

/* ------------------------------------------------------------
   حالة التغييرات غير المحفوظة
   ------------------------------------------------------------ */
window.hasUnsavedChanges = false;

/* ------------------------------------------------------------
   مراجع المودالات
   ------------------------------------------------------------ */
let confirmCallback = null;
let duplicateConfirmCallback = null;
let lastFocusedElement = null;

/* ------------------------------------------------------------
   اختصار DOM
   ------------------------------------------------------------ */
function $(id) {
    return document.getElementById(id);
}
window.$ = $;

/* ------------------------------------------------------------
   ✅ رسائل مساعدة — إصلاح مشكلة عدم التنظيف
   ------------------------------------------------------------ */
function showMsg(id, text, color) {
    const el = $(id);
    if (!el) return;

    // ✅ نستخدم textContent بدلاً من innerHTML + sanitize
    el.textContent = text;
    el.style.color = color || '';

    // احتفظ بمرجع الرسالة الحالية لمنع التنظيف المتزامن مع رسالة جديدة
    const myToken = Symbol('msg');
    el._msgToken = myToken;

    setTimeout(() => {
        // ✅ نظّف فقط إذا لم تصل رسالة جديدة خلال المهلة
        if (el && el._msgToken === myToken) {
            el.textContent = '';
            el.style.color = '';
            el._msgToken = null;
        }
    }, 4000);
}
window.showMsg = showMsg;

function showIf(id, cond) {
    const el = $(id);
    if (el) el.classList.toggle('hidden', !cond);
}
window.showIf = showIf;

function hide(id) {
    const el = $(id);
    if (el) el.classList.add('hidden');
}
window.hide = hide;

function show(id) {
    const el = $(id);
    if (el) el.classList.remove('hidden');
}
window.show = show;

function setVal(id, val) {
    const el = $(id);
    if (el) el.value = val !== undefined && val !== null ? val : '';
}
window.setVal = setVal;

/* ------------------------------------------------------------
   التغييرات غير المحفوظة
   ------------------------------------------------------------ */
function setUnsavedChanges(value) {
    if (window.hasUnsavedChanges === value) return;
    window.hasUnsavedChanges = value;
    const banner = $('unsavedChangesBanner');
    if (banner) banner.classList.toggle('show', value);
}
window.setUnsavedChanges = setUnsavedChanges;

window.addEventListener('beforeunload', (e) => {
    if (window.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'لديك بيانات غير محفوظة. هل تريد مغادرة الصفحة؟';
        return e.returnValue;
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && window.hasUnsavedChanges) {
        document.title = '⚠️ تغييرات غير محفوظة | عيادتي';
    } else {
        document.title = 'عيادتي | د. أغيد أحمد عباس';
    }
});

/* ------------------------------------------------------------
   شريط التقدم
   ------------------------------------------------------------ */
function showProgress(id, pct) {
    const el = $(id);
    if (!el) return;
    el.classList.remove('hidden');
    const fill = el.querySelector('.progress-bar-fill');
    if (fill) fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
    if (pct >= 100) {
        setTimeout(() => {
            el.classList.add('hidden');
            if (fill) fill.style.width = '0%';
        }, 500);
    }
}
window.showProgress = showProgress;

/* ------------------------------------------------------------
   إضافة الصور إلى الشبكة
   ------------------------------------------------------------ */
async function addImagesToGrid(files, gridId, mapObj) {
    const grid = $(gridId);
    if (!grid || !files || files.length === 0) return;

    const fileArr = Array.from(files);

    const placeholders = fileArr.map(file => {
        const uid = AppUtils.generateId();
        const wrapper = document.createElement('div');
        wrapper.className = 'image-thumb-wrapper';
        wrapper.dataset.uid = uid;
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.justifyContent = 'center';
        wrapper.style.backgroundColor = 'var(--primary-light)';
        wrapper.innerHTML = '<span style="font-size:11px;color:var(--sub);">⏳ معالجة...</span>';
        grid.appendChild(wrapper);
        return { file, uid, wrapper };
    });

    const compressed = await AppUtils.compressImagesParallel(fileArr);

    for (let i = 0; i < placeholders.length; i++) {
        const { file, uid, wrapper } = placeholders[i];
        const res = compressed[i];

        if (!res.ok) {
            AppUtils.showError(`فشل معالجة "${file.name}": ${res.error}`);
            wrapper.remove();
            continue;
        }

        mapObj.set(uid, { dataURL: res.dataURL });

        wrapper.innerHTML = '';
        wrapper.style.display = '';
        wrapper.style.alignItems = '';
        wrapper.style.justifyContent = '';
        wrapper.style.backgroundColor = '';

        const img = document.createElement('img');
        img.className = 'image-thumb';
        img.src = res.dataURL;
        img.alt = 'صورة مرفوعة';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onclick = () => {
            const all = [];
            grid.querySelectorAll('img.image-thumb').forEach(j => all.push(j.src));
            const idx = all.indexOf(img.src);
            openImageViewer(all, idx >= 0 ? idx : 0);
        };

        const rmBtn = document.createElement('button');
        rmBtn.type = 'button';
        rmBtn.className = 'remove-image';
        rmBtn.innerHTML = '✖';
        rmBtn.setAttribute('aria-label', 'حذف الصورة');
        rmBtn.onclick = (ev) => {
            ev.stopPropagation();
            mapObj.delete(uid);
            wrapper.remove();
            markUnsavedIfNotEdit();
        };

        wrapper.appendChild(img);
        wrapper.appendChild(rmBtn);
    }
    markUnsavedIfNotEdit();
}
window.addImagesToGrid = addImagesToGrid;

function markUnsavedIfNotEdit() {
    if (!(window.AppState && window.AppState.editMode)) setUnsavedChanges(true);
}
window.markUnsavedIfNotEdit = markUnsavedIfNotEdit;

function resetTempImages() {
    window.tempImagesMap.clear();
    const grid = $('visitImagesGrid');
    if (grid) grid.innerHTML = '';
}
window.resetTempImages = resetTempImages;

/* ------------------------------------------------------------
   عارض الصور
   ------------------------------------------------------------ */
function openImageViewer(images, index) {
    window.viewerImages = (images || []).slice();
    window.viewerIndex = Math.max(0, Math.min(index || 0, window.viewerImages.length - 1));
    if (!window.viewerImages.length) return;

    viewerLastFocused = document.activeElement;
    updateViewerImage();
    const viewer = $('imageViewer');
    if (viewer) {
        viewer.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        setTimeout(() => $('closeImageViewerBtn')?.focus(), 50);
    }
}
window.openImageViewer = openImageViewer;

function updateViewerImage() {
    const img = $('viewerImage');
    if (img) {
        img.src = window.viewerImages[window.viewerIndex] || '';
        img.alt = `صورة ${window.viewerIndex + 1} من ${window.viewerImages.length}`;
    }
    const counter = $('viewerCounter');
    if (counter) counter.textContent = `${window.viewerIndex + 1} / ${window.viewerImages.length}`;
}

function closeImageViewer() {
    $('imageViewer')?.classList.add('hidden');
    document.body.style.overflow = '';
    window.viewerImages = [];
    window.viewerIndex = 0;
    if (viewerLastFocused && typeof viewerLastFocused.focus === 'function') {
        viewerLastFocused.focus();
        viewerLastFocused = null;
    }
}
window.closeImageViewer = closeImageViewer;

function navigateImage(dir) {
    if (!window.viewerImages.length) return;
    window.viewerIndex = (window.viewerIndex + dir + window.viewerImages.length) % window.viewerImages.length;
    updateViewerImage();
}
window.navigateImage = navigateImage;

/* ------------------------------------------------------------
   معارض الصور
   ------------------------------------------------------------ */
function clearImageGalleries() {
    window.imageGalleries.clear();
    window.galleryCounter = 0;
}
window.clearImageGalleries = clearImageGalleries;

function registerGallery(images) {
    const key = 'gallery_' + (++window.galleryCounter);
    window.imageGalleries.set(key, [...(images || [])]);
    return key;
}
window.registerGallery = registerGallery;

/* ------------------------------------------------------------
   ✅ دوال عامة موحّدة للبحث (أدوية + تحاليل)
   - تقلل التكرار وتضمن سلوكاً موحّداً
   ------------------------------------------------------------ */

/**
 * بحث عام في مصدر بيانات (أدوية أو تحاليل)
 * @param {string} query - نص البحث
 * @param {HTMLElement} resultsDiv - حاوية النتائج
 * @param {Function} onSelect - callback عند الاختيار
 * @param {Object} opts - {dataAttr: 'med'|'labtest', noResultsText, emptyText}
 */
async function searchGenericAndDisplay(query, resultsDiv, onSelect, opts) {
    if (!resultsDiv) return;
    const { dataAttr = 'item', noResultsText = 'لا توجد نتائج (سيُضاف كجديد)' } = opts || {};

    if (!query) {
        resultsDiv.classList.remove('show');
        resultsDiv.innerHTML = '';
        return;
    }

    const items = await DB.getMedications(); // سيتم استبدالها حسب النوع من الخارج
    // ملاحظة: الدالة الحقيقية تأخذ البيانات مباشرة
    void items;
}
window.searchGenericAndDisplay = searchGenericAndDisplay;

/**
 * البحث الموحّد عن عناصر (أدوية أو تحاليل) وعرضها
 * @param {Array} items - مصفوفة العناصر التي تحتوي على .name
 * @param {string} query - نص البحث
 * @param {HTMLElement} resultsDiv - حاوية النتائج
 * @param {Function} onSelect - callback عند الاختيار
 * @param {Object} opts - {dataAttr, noResultsText}
 */
function displaySearchResults(items, query, resultsDiv, onSelect, opts) {
    if (!resultsDiv) return;
    const { dataAttr = 'item', noResultsText = 'لا توجد نتائج (سيُضاف كجديد)' } = opts || {};

    if (!query) {
        resultsDiv.classList.remove('show');
        resultsDiv.innerHTML = '';
        return;
    }

    const q = query.toLowerCase();
    const results = items
        .filter(item => item.name && item.name.toLowerCase().includes(q))
        .slice(0, 8);

    if (results.length) {
        resultsDiv.innerHTML = results.map(item =>
            '<div class="search-item" data-' + dataAttr + '="' +
            AppUtils.sanitizeAttribute(item.name) + '">' +
            AppUtils.sanitize(item.name) + '</div>'
        ).join('');
    } else {
        resultsDiv.innerHTML = '<div class="search-item" style="color:var(--sub);cursor:default;">' +
            AppUtils.sanitize(noResultsText) + '</div>';
    }

    resultsDiv.classList.add('show');
    resultsDiv._onSelect = onSelect;

    if (!resultsDiv._clickHandlerAttached) {
        resultsDiv.addEventListener('click', (e) => {
            const item = e.target.closest('.search-item');
            if (!item) return;
            const value = item.dataset[dataAttr];
            if (value && resultsDiv._onSelect) {
                resultsDiv._onSelect(value);
                resultsDiv.classList.remove('show');
                resultsDiv.innerHTML = '';
            }
        });
        resultsDiv._clickHandlerAttached = true;
    }
}
window.displaySearchResults = displaySearchResults;

/**
 * إعداد بحث عام على حقل إدخال
 * @param {string} inputId
 * @param {string} resultsId
 * @param {Function} getItemsFn - دالة async ترجع مصفوفة العناصر {name}
 * @param {Function} onSelect
 * @param {Object} opts
 */
function setupGenericSearch(inputId, resultsId, getItemsFn, onSelect, opts) {
    const input = $(inputId);
    const resultsDiv = $(resultsId);
    if (!input || !resultsDiv) return;

    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    newInput.addEventListener('input', AppUtils.debounce(async function () {
        const query = this.value.trim();
        if (!query) {
            resultsDiv.classList.remove('show');
            resultsDiv.innerHTML = '';
            return;
        }
        const items = await getItemsFn();
        displaySearchResults(items, query, resultsDiv, onSelect, opts);
    }, 250));

    newInput.addEventListener('focus', async function () {
        if (this.value.trim()) {
            const items = await getItemsFn();
            displaySearchResults(items, this.value.trim(), resultsDiv, onSelect, opts);
        }
    });
}
window.setupGenericSearch = setupGenericSearch;

/* ------------------------------------------------------------
   ✅ دالة موحّدة لشرائح عوامل الخطر القلبية
   - تُستخدم في نموذج المريض الجديد وفي مودال التعديل
   ------------------------------------------------------------ */
function bindCvRiskChips(containerId, hiddenInputId, onChange) {
    const container = $(containerId);
    if (!container) return;

    // تنظيف أي مستمعات قديمة باستبدال العنصر بنسخة منه
    if (container._cvBound) {
        // بالفعل مرتبط — لا نكرر
        return;
    }
    container._cvBound = true;

    container.addEventListener('click', (e) => {
        const chip = e.target.closest('.cv-risk-chip');
        if (!chip) return;
        chip.classList.toggle('selected');
        chip.setAttribute('aria-checked', chip.classList.contains('selected') ? 'true' : 'false');
        updateCvRisksHidden(containerId, hiddenInputId);
        if (typeof onChange === 'function') onChange();
    });

    container.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const chip = e.target.closest('.cv-risk-chip');
            if (chip) {
                e.preventDefault();
                chip.click();
            }
        }
    });
}
window.bindCvRiskChips = bindCvRiskChips;

function updateCvRisksHidden(containerId, hiddenId) {
    const chips = document.querySelectorAll(`#${containerId} .cv-risk-chip.selected`);
    const el = $(hiddenId);
    if (el) el.value = Array.from(chips).map(c => c.dataset.risk).join(', ');
}
window.updateCvRisksHidden = updateCvRisksHidden;

/* ------------------------------------------------------------
   تأكيدات
   ------------------------------------------------------------ */
function confirmAction(title, msg, cb) {
    lastFocusedElement = document.activeElement;
    $('confirmTitle').textContent = title;
    $('confirmMessage').textContent = msg;
    $('confirmModal').classList.remove('hidden');
    confirmCallback = cb;
    duplicateConfirmCallback = null;
    setTimeout(() => $('confirmBtn')?.focus(), 50);
}
window.confirmAction = confirmAction;

function showDuplicateNameDialog(patientName, onConfirm) {
    lastFocusedElement = document.activeElement;
    $('confirmTitle').textContent = 'تنبيه اسم مكرر';
    $('confirmMessage').textContent = `يوجد مريض بنفس الاسم "${patientName}". هل تريد الحفظ على الرغم من ذلك؟`;
    $('confirmModal').classList.remove('hidden');
    duplicateConfirmCallback = onConfirm;
    confirmCallback = null;
    setTimeout(() => $('confirmBtn')?.focus(), 50);
}
window.showDuplicateNameDialog = showDuplicateNameDialog;

function closeConfirmModal() {
    $('confirmModal')?.classList.add('hidden');
    confirmCallback = null;
    duplicateConfirmCallback = null;
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
        lastFocusedElement = null;
    }
}
window.closeConfirmModal = closeConfirmModal;

/* ------------------------------------------------------------
   إخفاء نتائج البحث
   ------------------------------------------------------------ */
function hideAllSearchResults() {
    ['searchResults', 'medSearchResults', 'pMedHistorySearchResults', 'epMedHistorySearchResults',
     'patientLabTestSearchResults', 'evMedSearchResults']
        .forEach(id => {
            const el = $(id);
            if (el) {
                el.classList.remove('show');
                el.innerHTML = '';
            }
        });
}
window.hideAllSearchResults = hideAllSearchResults;

/* ------------------------------------------------------------
   أحداث عامة
   ------------------------------------------------------------ */
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box') && !e.target.closest('.search-results')) {
        hideAllSearchResults();
    }
});

document.addEventListener('keydown', (e) => {
    const viewer = $('imageViewer');
    if (viewer && !viewer.classList.contains('hidden')) {
        if (e.key === 'ArrowRight') { e.preventDefault(); navigateImage(-1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); navigateImage(1); }
        else if (e.key === 'Escape') { e.preventDefault(); closeImageViewer(); }
        else if (e.key === 'Tab') {
            const focusables = viewer.querySelectorAll('button:not([disabled])');
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        return;
    }

    if (e.key === 'Tab') {
        const openModal = document.querySelector('.modal-overlay:not(.hidden)');
        if (!openModal) return;
        const focusables = openModal.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
});

document.querySelectorAll('.modal-overlay').forEach(o => {
    o.addEventListener('mousedown', function (e) {
        if (e.target === this) this._mousedownTarget = e.target;
    });
    o.addEventListener('click', function (e) {
        if (e.target === this && this._mousedownTarget === this) {
            if (this.id === 'confirmModal') closeConfirmModal();
            else if (this.id === 'visitModal' && typeof closeVisitModal === 'function') closeVisitModal();
            else if (this.id === 'editPatientModal' && typeof closeEditPatientModal === 'function') closeEditPatientModal();
            else this.classList.add('hidden');
        }
        this._mousedownTarget = null;
    });
});

document.addEventListener('DOMContentLoaded', () => {
    $('confirmBtn')?.addEventListener('click', () => {
        const cb = confirmCallback;
        const dcb = duplicateConfirmCallback;
        closeConfirmModal();
        if (cb) cb();
        else if (dcb) dcb();
    });
    $('confirmCancelBtn')?.addEventListener('click', closeConfirmModal);
    $('closeImageViewerBtn')?.addEventListener('click', closeImageViewer);
    $('prevImageBtn')?.addEventListener('click', () => navigateImage(-1));
    $('nextImageBtn')?.addEventListener('click', () => navigateImage(1));
    $('errorCloseBtn')?.addEventListener('click', AppUtils.hideError);
});

/* ------------------------------------------------------------
   حالة الاتصال
   ------------------------------------------------------------ */
function updateConnectionStatus() {
    const banner = $('offlineBanner');
    const badge = $('connectionStatus');
    if (navigator.onLine) {
        banner?.classList.remove('show');
        if (badge) badge.textContent = '🌐 متصل بالإنترنت';
    } else {
        banner?.classList.add('show');
        if (badge) badge.textContent = '📱 يعمل بدون إنترنت';
    }
}
window.updateConnectionStatus = updateConnectionStatus;
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);