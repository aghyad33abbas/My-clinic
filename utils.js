/* ============================================================
   utils.js - أدوات مساعدة عامة
   ============================================================ */
'use strict';

const AppUtils = {
    /* ------------------------------------------------------------
       الحماية من XSS
       ------------------------------------------------------------ */
    sanitize(str) {
        if (str == null) return '';
        const el = document.createElement('span');
        el.textContent = String(str);
        return el.innerHTML;
    },

    sanitizeAttribute(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/`/g, '&#96;');
    },

    setText(element, text) {
        if (typeof element === 'string') element = document.getElementById(element);
        if (!element) return;
        element.textContent = text;
    },

    /* ------------------------------------------------------------
       الأخطاء
       ------------------------------------------------------------ */
    hideError() {
        const banner = document.getElementById('errorBanner');
        if (banner) banner.classList.remove('show');
    },

    showError(message, duration = 5000) {
        const banner = document.getElementById('errorBanner');
        const msgEl = document.getElementById('errorMessage');
        if (banner && msgEl) {
            msgEl.textContent = message;
            banner.classList.add('show');
            if (duration > 0) setTimeout(() => banner.classList.remove('show'), duration);
        }
    },

    toast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.textContent = message;
        el.setAttribute('role', 'status');
        container.appendChild(el);
        setTimeout(() => {
            el.classList.add('hide');
            setTimeout(() => el.remove(), 300);
        }, duration);
    },

    /* ------------------------------------------------------------
       التواريخ
       ------------------------------------------------------------ */
    _locale: 'ar-SY-u-ca-gregory-nu-latn',

    formatDate(d) {
        if (!d) return '--';
        try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return String(d);
            return dt.toLocaleDateString(this._locale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
        } catch {
            return String(d);
        }
    },

    formatDateShort(d) {
        if (!d) return '--';
        try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return String(d);
            return dt.toLocaleDateString(this._locale, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        } catch {
            return String(d);
        }
    },

    todayISO() {
        const d = new Date();
        const tzOffset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
    },

    nowISO() {
        return new Date().toISOString();
    },

    addDaysISO(days) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        const tzOffset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
    },

    getMonthYear(d) {
        if (!d) return '';
        const dt = new Date(d);
        if (isNaN(dt)) return '';
        return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
    },

    /* ------------------------------------------------------------
       التحقق
       ------------------------------------------------------------ */

    // ✅ معدّل: التحقق من الهاتف مُعطَّل — يقبل أي إدخال
    validatePhone(phone) {
        return true;
    },

    validateAge(age) {
        if (age === '' || age == null) return true;
        const n = parseInt(age, 10);
        return !isNaN(n) && n >= 0 && n <= 120;
    },

    validateBP(bp) {
        if (!bp) return true;
        const m = bp.trim().match(/^(\d{2,3})\/(\d{2,3})$/);
        if (!m) return false;
        const sys = parseInt(m[1], 10);
        const dia = parseInt(m[2], 10);
        if (sys < 40 || sys > 300) return false;
        if (dia < 20 || dia > 200) return false;
        if (sys <= dia) return false;
        return true;
    },

    validateRequired(value, fieldName) {
        if (!value || !String(value).trim()) return `حقل "${fieldName}" مطلوب`;
        return null;
    },

    /* ------------------------------------------------------------
       ضغط الصور — بدون أي حد أقصى للحجم أو العدد
       ------------------------------------------------------------ */
    async compressImage(file, maxWidth = 1600, quality = 0.85) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        let w = img.width, h = img.height;
                        if (w > maxWidth) {
                            h = Math.round((h * maxWidth) / w);
                            w = maxWidth;
                        }
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#fff';
                        ctx.fillRect(0, 0, w, h);
                        ctx.drawImage(img, 0, 0, w, h);
                        const dataURL = canvas.toDataURL('image/jpeg', quality);
                        img.src = '';
                        canvas.width = 0;
                        canvas.height = 0;
                        resolve(dataURL);
                    } catch (err) {
                        img.src = '';
                        reject(new Error('فشل معالجة الصورة: ' + err.message));
                    }
                };
                img.onerror = () => reject(new Error('فشل قراءة محتوى الصورة، قد تكون تالفة'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('فشل قراءة الملف من النظام'));
            reader.readAsDataURL(file);
        });
    },

    async compressImagesParallel(files, maxWidth = 1600, quality = 0.85) {
        const arr = Array.from(files || []);
        const results = await Promise.allSettled(
            arr.map(f => this.compressImage(f, maxWidth, quality))
        );
        return results.map((r, i) => ({
            file: arr[i],
            ok: r.status === 'fulfilled',
            dataURL: r.status === 'fulfilled' ? r.value : null,
            error: r.status === 'rejected' ? r.reason.message : null
        }));
    },

    /* ------------------------------------------------------------
       توليد المعرّفات
       ------------------------------------------------------------ */
    _idCounter: 0,
    generateId() {
        this._idCounter = (this._idCounter + 1) % 1000000;
        const ts = Date.now().toString(36);
        const c = this._idCounter.toString(36);
        const rnd = Math.random().toString(36).slice(2, 11);
        return `${ts}-${c}-${rnd}`;
    },

    nextNumericId() {
        const ts = Date.now();
        const rnd = Math.floor(Math.random() * 1000);
        return ts * 1000 + rnd;
    },

    /* ------------------------------------------------------------
       التصدير
       ------------------------------------------------------------ */
    downloadJSON(data, filename) {
        try {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            AppUtils.showError('فشل التصدير: ' + err.message);
        }
    },

    /* ------------------------------------------------------------
       أدوات مساعدة
       ------------------------------------------------------------ */
    debounce(fn, delay = 250) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
};

window.AppUtils = AppUtils;