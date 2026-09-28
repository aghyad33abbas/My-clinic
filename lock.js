/* ============================================================
   lock.js - إدارة شاشة القفل والقفل التلقائي (النسخة النهائية)
   مع حفظ/استرجاع المسودة + قفل ذكي عند تبديل التطبيقات
   ============================================================ */
'use strict';

const Lock = {
    _autoLockTimer: null,
    _lastActivity: Date.now(),
    _hiddenAt: null,
    _boundActivityHandler: null,

    AUTO_LOCK_KEY: 'clinic_auto_lock_minutes',
    DRAFT_KEY: 'clinic_draft',

    // معامل الغياب: لا يقفل عند العودة إلا إذا غاب ضعف المدة
    AWAY_MULTIPLIER: 2,

    // صلاحية المسودة: 6 ساعات كحد أقصى
    DRAFT_MAX_AGE_MS: 6 * 60 * 60 * 1000,

    init() {
        this._bindEvents();
        this._restoreAutoLockSetting();
        this._startActivityTracking();
    },

    _bindEvents() {
        document.getElementById('setupPinBtn')?.addEventListener('click', () => this._handleSetupPin());
        document.getElementById('unlockPinBtn')?.addEventListener('click', () => this._handleUnlockPin());
        document.getElementById('forgotPinBtn')?.addEventListener('click', () => this._handleForgotPin());
        document.getElementById('lockNowBtn')?.addEventListener('click', () => this.lockNow());
        document.getElementById('changePinBtn')?.addEventListener('click', () => this.openChangePinModal());

        ['setupPinInput', 'setupPinConfirm', 'unlockPinInput'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (id === 'unlockPinInput') this._handleUnlockPin();
                    else this._handleSetupPin();
                }
            });
        });

        // سلوك ذكي عند تبديل التطبيقات
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                if (Crypto.isUnlocked()) {
                    try { this._saveDraft(); } catch (e) { console.warn('Draft save failed:', e); }
                }
                this._hiddenAt = Date.now();
            } else if (document.visibilityState === 'visible') {
                const limit = this._getAutoLockMinutes();
                if (limit <= 0 || !Crypto.isUnlocked()) {
                    this._hiddenAt = null;
                    return;
                }
                const hiddenForMin = (Date.now() - (this._hiddenAt || Date.now())) / 60000;
                if (hiddenForMin >= limit * this.AWAY_MULTIPLIER) {
                    this.lockNow();
                } else {
                    this._resetActivityTimer();
                }
                this._hiddenAt = null;
            }
        });

        // احتياط إضافي: احفظ عند محاولة إغلاق الصفحة
        window.addEventListener('pagehide', () => {
            if (Crypto.isUnlocked()) {
                try { this._saveDraft(); } catch (e) {}
            }
        });
    },

    showLockScreen() {
        const screen = document.getElementById('lockScreen');
        if (!screen) return;
        screen.classList.remove('hidden');

        const setupSection = document.getElementById('lockSetupSection');
        const unlockSection = document.getElementById('lockUnlockSection');
        const errEl = document.getElementById('lockError');
        if (errEl) errEl.textContent = '';

        if (Crypto.hasPin()) {
            setupSection?.classList.add('hidden');
            unlockSection?.classList.remove('hidden');
            setTimeout(() => document.getElementById('unlockPinInput')?.focus(), 100);
        } else {
            setupSection?.classList.remove('hidden');
            unlockSection?.classList.add('hidden');
            setTimeout(() => document.getElementById('setupPinInput')?.focus(), 100);
        }
    },

    hideLockScreen() {
        document.getElementById('lockScreen')?.classList.add('hidden');
    },

    async _handleSetupPin() {
        const pin = document.getElementById('setupPinInput')?.value || '';
        const confirm = document.getElementById('setupPinConfirm')?.value || '';
        const errEl = document.getElementById('lockError');
        if (errEl) errEl.textContent = '';

        if (pin.length < 4) {
            if (errEl) errEl.textContent = 'الرقم السري يجب أن يكون 4 أرقام على الأقل';
            return;
        }
        if (pin !== confirm) {
            if (errEl) errEl.textContent = 'الرقمان غير متطابقين';
            return;
        }
        if (!/^\d+$/.test(pin)) {
            if (errEl) errEl.textContent = 'أرقام فقط';
            return;
        }

        try {
            await Crypto.setupPin(pin);
            this.hideLockScreen();
            AppUtils.toast('تم تفعيل التشفير بنجاح', 'success');
            await DB.addAuditLog('تفعيل الحماية', 'تم إعداد الرقم السري وتشفير البيانات');
            await App.startAfterUnlock();
        } catch (err) {
            if (errEl) errEl.textContent = 'خطأ: ' + err.message;
        }
    },

    async _handleUnlockPin() {
        const pin = document.getElementById('unlockPinInput')?.value || '';
        const errEl = document.getElementById('lockError');
        if (errEl) errEl.textContent = '';

        if (!pin) {
            if (errEl) errEl.textContent = 'أدخل الرقم السري';
            return;
        }

        try {
            await Crypto.unlockWithPin(pin);
            const input = document.getElementById('unlockPinInput');
            if (input) input.value = '';
            this.hideLockScreen();
            AppUtils.toast('مرحباً بك', 'success');
            await DB.addAuditLog('فتح القفل', 'تم فتح التطبيق بنجاح');
            await App.startAfterUnlock();

            // استرجع المسودة إن وُجدت
            const restored = this._restoreDraft();
            if (restored) {
                AppUtils.toast('تم استرجاع البيانات غير المحفوظة', 'info', 4000);
            }

            this._resetActivityTimer();
        } catch (err) {
            if (errEl) errEl.textContent = err.message || 'فشل';
            const input = document.getElementById('unlockPinInput');
            if (input) {
                input.value = '';
                input.focus();
            }
            await DB.addAuditLog('محاولة فتح فاشلة', 'رقم سري خاطئ');
        }
    },

    _handleForgotPin() {
        confirmAction(
            '⚠️ نسيت الرقم السري',
            'الطريقة الوحيدة للمتابعة هي حذف كل البيانات المشفرة نهائياً. هل أنت متأكد؟ يُفضل تصدير نسخة احتياطية قبل المتابعة إن أمكن.',
            async () => {
                try {
                    if (DB.db) DB.db.close();
                    await new Promise((resolve) => {
                        const req = indexedDB.deleteDatabase(DB_NAME);
                        req.onsuccess = resolve;
                        req.onerror = resolve;
                        req.onblocked = resolve;
                    });
                    Object.keys(localStorage)
                        .filter(k => k.startsWith('عيادتي_') || k.startsWith('clinic_') || k.startsWith('counter_'))
                        .forEach(k => localStorage.removeItem(k));
                    sessionStorage.removeItem(this.DRAFT_KEY);
                    AppUtils.toast('تم حذف كل البيانات', 'success');
                    setTimeout(() => location.reload(), 500);
                } catch (err) {
                    AppUtils.showError('فشل الحذف: ' + err.message);
                }
            }
        );
    },

    /* ============================================================
       حفظ المسودة قبل القفل/المغادرة
       ============================================================ */
    _saveDraft() {
        const get = (id) => document.getElementById(id)?.value || '';

        const draft = {
            visitType: get('visitType'),

            patient: {
                name: get('pName'),
                age: get('pAge'),
                gender: get('pGender'),
                phone: get('pPhone'),
                address: get('pAddress'),
                clinic: get('pClinic'),
                status: get('pStatus'),
                chronic: get('pChronic'),
                surgical: get('pSurgical'),
                allergy: get('pAllergy'),
                cvRisks: get('pCvRisks')
            },

            visit: {
                bp: get('vBP'),
                pulse: get('vPulse'),
                spo2: get('vSpO2'),
                temp: get('vTemp'),
                weight: get('vWeight'),
                date: get('vDate'),
                diag: get('vDiag'),
                notes: get('vNotes'),
                nextDate: get('vNextDate'),
                nextTime: get('vNextTime')
            },

            appState: {
                currentPatientFileNo: window.AppState?.currentPatientFileNo || null,
                editFileNo: window.AppState?.editFileNo || null,
                editMode: !!window.AppState?.editMode,
                currentPrescriptions: window.AppState?.currentPrescriptions || [],
                currentMedHistory: window.AppState?.currentMedHistory || [],
                currentPatientLabTests: window.AppState?.currentPatientLabTests || []
            },

            cvRisksSelected: Array.from(document.querySelectorAll('#cvRiskChips .cv-risk-chip.selected'))
                                  .map(c => c.dataset.risk),

            currentPage: document.querySelector('.page-section.active')?.id?.replace('page-', '') || 'visit',

            savedAt: Date.now()
        };

        const hasAnyData =
            draft.visitType ||
            Object.values(draft.patient).some(v => v) ||
            Object.values(draft.visit).some(v => v) ||
            draft.appState.currentPatientFileNo ||
            draft.appState.editFileNo ||
            draft.appState.currentPrescriptions.length ||
            draft.appState.currentMedHistory.length ||
            draft.cvRisksSelected.length;

        if (!hasAnyData) return;

        try {
            sessionStorage.setItem(this.DRAFT_KEY, JSON.stringify(draft));
        } catch (e) {
            console.warn('تعذّر حفظ المسودة:', e);
        }
    },

    /* ============================================================
       استرجاع المسودة بعد فتح القفل
       ============================================================ */
    _restoreDraft() {
        let raw;
        try {
            raw = sessionStorage.getItem(this.DRAFT_KEY);
        } catch { return false; }
        if (!raw) return false;

        let d;
        try { d = JSON.parse(raw); } catch { sessionStorage.removeItem(this.DRAFT_KEY); return false; }

        if (!d.savedAt || Date.now() - d.savedAt > this.DRAFT_MAX_AGE_MS) {
            sessionStorage.removeItem(this.DRAFT_KEY);
            return false;
        }

        const setV = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined && val !== null) el.value = val;
        };

        // 1) نوع الزيارة
        const vt = document.getElementById('visitType');
        if (vt && d.visitType) {
            vt.value = d.visitType;
            vt.dataset.prevValue = d.visitType;
        }

        // 2) حقول المريض
        const patientMap = {
            name: 'pName', age: 'pAge', gender: 'pGender', phone: 'pPhone',
            address: 'pAddress', clinic: 'pClinic', status: 'pStatus',
            chronic: 'pChronic', surgical: 'pSurgical', allergy: 'pAllergy',
            cvRisks: 'pCvRisks'
        };
        Object.entries(d.patient || {}).forEach(([k, v]) => {
            if (patientMap[k]) setV(patientMap[k], v);
        });

        // 3) حقول الزيارة
        const visitMap = {
            bp: 'vBP', pulse: 'vPulse', spo2: 'vSpO2', temp: 'vTemp',
            weight: 'vWeight', date: 'vDate', diag: 'vDiag', notes: 'vNotes',
            nextDate: 'vNextDate', nextTime: 'vNextTime'
        };
        Object.entries(d.visit || {}).forEach(([k, v]) => {
            if (visitMap[k]) setV(visitMap[k], v);
        });

        // 4) حالة التطبيق
        if (window.AppState && d.appState) {
            window.AppState.currentPatientFileNo = d.appState.currentPatientFileNo || null;
            window.AppState.editFileNo = d.appState.editFileNo || null;
            window.AppState.editMode = !!d.appState.editMode;
            window.AppState.currentPrescriptions = d.appState.currentPrescriptions || [];
            window.AppState.currentMedHistory = d.appState.currentMedHistory || [];
            window.AppState.currentPatientLabTests = d.appState.currentPatientLabTests || [];
        }

        // 5) شرائح عوامل الخطر
        if (Array.isArray(d.cvRisksSelected)) {
            document.querySelectorAll('#cvRiskChips .cv-risk-chip').forEach(chip => {
                const isSelected = d.cvRisksSelected.includes(chip.dataset.risk);
                chip.classList.toggle('selected', isSelected);
                chip.setAttribute('aria-checked', isSelected ? 'true' : 'false');
            });
        }

        // 6) إظهار الأقسام المناسبة
        const show = (id) => document.getElementById(id)?.classList.remove('hidden');
        const hide = (id) => document.getElementById(id)?.classList.add('hidden');

        if (d.visitType === 'new') {
            show('newPatientSection');
            hide('searchSection');
        } else if (d.visitType === 'existing') {
            show('searchSection');
            hide('newPatientSection');
        }

        if (d.appState?.currentPatientFileNo || d.appState?.editFileNo) {
            show('visitDetailsSection');
        }

        // 7) إعادة رسم الوصفات وسوابق الأدوية
        try {
            if (typeof window.renderPrescriptionList === 'function') {
                window.renderPrescriptionList();
            } else {
                this._fallbackRenderPrescriptions(window.AppState.currentPrescriptions);
            }
        } catch (e) { console.warn('renderPrescriptionList:', e); }

        try {
            if (typeof window.renderMedHistoryList === 'function') {
                window.renderMedHistoryList('pMedHistoryList');
            }
        } catch (e) { console.warn('renderMedHistoryList:', e); }

        try {
            if (typeof window.renderPatientLabTestsList === 'function') {
                window.renderPatientLabTestsList();
            }
        } catch (e) { console.warn('renderPatientLabTestsList:', e); }

        // 8) إعادة التنقل
        if (d.currentPage && typeof window.actuallyNavigateTo === 'function') {
            try { window.actuallyNavigateTo(d.currentPage); } catch {}
        }

        // 9) علامة تغييرات غير محفوظة
        if (typeof window.setUnsavedChanges === 'function') {
            window.setUnsavedChanges(true);
        }

        // 10) امسح المسودة
        sessionStorage.removeItem(this.DRAFT_KEY);

        return true;
    },

    _fallbackRenderPrescriptions(list) {
        const container = document.getElementById('prescriptionListContainer');
        if (!container || !Array.isArray(list) || list.length === 0) return;
        container.innerHTML = '';
        list.forEach((med) => {
            const div = document.createElement('div');
            div.className = 'prescription-item';
            const details = [med.dose, med.frequency, med.duration].filter(Boolean).join(' • ');
            div.innerHTML = `<span>💊 <strong>${AppUtils.sanitize(med.name || '')}</strong>${details ? ' — ' + AppUtils.sanitize(details) : ''}</span>`;
            container.appendChild(div);
        });
    },

    /* ------------------------------------------------------------
       قفل فوري + حفظ المسودة + مسح كامل للذاكرة الحساسة
       ------------------------------------------------------------ */
    lockNow() {
        // احفظ المسودة قبل أي مسح
        try { this._saveDraft(); } catch (e) { console.warn('Draft save on lock failed:', e); }

        // قفل المفتاح
        Crypto.lock();

        // مسح حالة التطبيق (بما فيها تحاليل المريض)
        if (window.AppState) {
            window.AppState.currentPatientFileNo = null;
            window.AppState.editFileNo = null;
            window.AppState.editMode = false;
            window.AppState.viewingVisit = null;
            window.AppState.currentPrescriptions = [];
            window.AppState.currentMedHistory = [];
            window.AppState.currentPatientLabTests = [];   // ✅ إضافة مفقودة سابقاً
            window.AppState.isSavingPatient = false;
        }

        // مسح خرائط الصور
        if (typeof tempImagesMap !== 'undefined' && tempImagesMap.clear) {
            tempImagesMap.clear();
        }
        if (typeof editingImagesMap !== 'undefined' && editingImagesMap.clear) {
            editingImagesMap.clear();
        }
        if (typeof imageGalleries !== 'undefined' && imageGalleries.clear) {
            imageGalleries.clear();
        }
        if (typeof galleryCounter !== 'undefined') {
            window.galleryCounter = 0;
        }

        // مسح عارض الصور
        if (typeof viewerImages !== 'undefined') {
            window.viewerImages = [];
            window.viewerIndex = 0;
        }

        // مسح شبكات الصور من DOM
        ['visitImagesGrid', 'evImagesGrid', 'existingImagesGallery', 'patientLabTestsList'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });

        // إعادة تعيين حالة التغييرات
        if (typeof hasUnsavedChanges !== 'undefined') {
            window.hasUnsavedChanges = false;
        }
        const unsaved = document.getElementById('unsavedChangesBanner');
        if (unsaved) unsaved.classList.remove('show');

        // إخفاء كل المودالات المفتوحة
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));

        // إظهار شاشة القفل
        this.showLockScreen();
        this._clearAutoLockTimer();
        AppUtils.toast('تم قفل التطبيق', 'info');
    },

    _startActivityTracking() {
        this._boundActivityHandler = () => {
            this._lastActivity = Date.now();
            this._resetActivityTimer();
        };
        ['click', 'keydown', 'touchstart', 'mousemove'].forEach(evt => {
            document.addEventListener(evt, this._boundActivityHandler, { passive: true });
        });
    },

    _getAutoLockMinutes() {
        const v = parseInt(localStorage.getItem(this.AUTO_LOCK_KEY), 10);
        return isNaN(v) ? 5 : v;
    },

    _restoreAutoLockSetting() {
        const sel = document.getElementById('autoLockMinutes');
        if (sel) sel.value = String(this._getAutoLockMinutes());
        sel?.addEventListener('change', () => {
            localStorage.setItem(this.AUTO_LOCK_KEY, sel.value);
            this._resetActivityTimer();
            AppUtils.toast('تم تحديث إعداد القفل التلقائي', 'info');
        });
    },

    _resetActivityTimer() {
        this._clearAutoLockTimer();
        const minutes = this._getAutoLockMinutes();
        if (minutes <= 0) return;
        if (!Crypto.isUnlocked()) return;
        this._autoLockTimer = setTimeout(() => {
            if (Crypto.isUnlocked()) this.lockNow();
        }, minutes * 60 * 1000);
    },

    _clearAutoLockTimer() {
        if (this._autoLockTimer) {
            clearTimeout(this._autoLockTimer);
            this._autoLockTimer = null;
        }
    },

    openChangePinModal() {
        const content = document.getElementById('pinModalContent');
        if (!content) return;
        content.innerHTML = `
            <label for="oldPin">الرقم السري الحالي</label>
            <input type="password" id="oldPin" inputmode="numeric" maxlength="8" autocomplete="current-password">
            <label for="newPin">الرقم السري الجديد</label>
            <input type="password" id="newPin" inputmode="numeric" maxlength="8" autocomplete="new-password">
            <label for="newPinConfirm">تأكيد الرقم الجديد</label>
            <input type="password" id="newPinConfirm" inputmode="numeric" maxlength="8" autocomplete="new-password">
            <div class="modal-actions">
                <button class="btn btn-outline" id="cancelChangePinBtn" type="button">إلغاء</button>
                <button class="btn" id="confirmChangePinBtn" type="button">💾 حفظ</button>
            </div>
        `;
        document.getElementById('pinModal')?.classList.remove('hidden');
        document.getElementById('cancelChangePinBtn')?.addEventListener('click', () => {
            document.getElementById('pinModal')?.classList.add('hidden');
        });
        document.getElementById('confirmChangePinBtn')?.addEventListener('click', () => this._handleChangePin());
    },

    async _handleChangePin() {
        const oldPin = document.getElementById('oldPin')?.value || '';
        const newPin = document.getElementById('newPin')?.value || '';
        const conf = document.getElementById('newPinConfirm')?.value || '';

        if (newPin.length < 4) {
            showMsg('pinModalMsg', 'الرقم الجديد قصير جداً', 'red');
            return;
        }
        if (newPin !== conf) {
            showMsg('pinModalMsg', 'الرقمان غير متطابقين', 'red');
            return;
        }

        try {
            await Crypto.unlockWithPin(oldPin);
            await Crypto.setupPin(newPin);
            document.getElementById('pinModal')?.classList.add('hidden');
            AppUtils.toast('تم تغيير الرقم السري', 'success');
            await DB.addAuditLog('تغيير PIN', 'تم تغيير الرقم السري');
        } catch (err) {
            showMsg('pinModalMsg', '❌ ' + err.message, 'red');
        }
    }
};

window.Lock = Lock;