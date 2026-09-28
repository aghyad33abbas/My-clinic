/* ============================================================
   db.js - IndexedDB نسخة V20
   - إصلاح تعارض اسم/إصدار القاعدة
   - ترحيل تلقائي من الإصدار القديم
   - إزالة الحد الأقصى لسجل التدقيق
   ============================================================ */
'use strict';

const DB_NAME = 'عيادتي_DB_V20';
const DB_VERSION = 20;

// قواعد البيانات القديمة للترحيل التلقائي
const LEGACY_DB_NAMES = ['عيادتي_DB_V18'];

const DB = {
    db: null,
    useLocalFallback: false,
    ready: false,

    async open() {
        // ترحيل القواعد القديمة إن وُجدت قبل فتح القاعدة الجديدة
        await this._migrateLegacyDatabases();

        return new Promise((resolve) => {
            if (!window.indexedDB) {
                this.useLocalFallback = true;
                this.ready = true;
                this.showFallbackBanner();
                resolve();
                return;
            }

            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const d = e.target.result;
                const tx = e.target.transaction;

                if (!d.objectStoreNames.contains('patients')) {
                    const s = d.createObjectStore('patients', { keyPath: 'fileNo' });
                    s.createIndex('nameIdx', 'name', { unique: false });
                    s.createIndex('phoneIdx', 'phone', { unique: false });
                    s.createIndex('clinicIdx', 'clinic', { unique: false });
                    s.createIndex('statusIdx', 'status', { unique: false });
                    s.createIndex('lastVisitIdx', 'lastVisit', { unique: false });
                }

                if (!d.objectStoreNames.contains('appointments')) {
                    const s = d.createObjectStore('appointments', { keyPath: 'id' });
                    s.createIndex('dateIdx', 'date', { unique: false });
                    s.createIndex('fileNoIdx', 'fileNo', { unique: false });
                    s.createIndex('statusIdx', 'status', { unique: false });
                }

                if (!d.objectStoreNames.contains('standalone')) {
                    const s = d.createObjectStore('standalone', { keyPath: 'id' });
                    s.createIndex('dateIdx', 'date', { unique: false });
                    s.createIndex('statusIdx', 'status', { unique: false });
                }

                if (!d.objectStoreNames.contains('imagesStore')) {
                    const s = d.createObjectStore('imagesStore', { keyPath: 'compositeKey' });
                    s.createIndex('visitIdIdx', 'visitId', { unique: false });
                    s.createIndex('orderIdx', 'order', { unique: false });
                }

                if (!d.objectStoreNames.contains('counters')) {
                    d.createObjectStore('counters', { keyPath: 'name' });
                }

                if (!d.objectStoreNames.contains('auditLog')) {
                    const s = d.createObjectStore('auditLog', { keyPath: 'id', autoIncrement: true });
                    s.createIndex('timestampIdx', 'timestamp', { unique: false });
                    s.createIndex('actionIdx', 'action', { unique: false });
                }

                if (!d.objectStoreNames.contains('medications')) {
                    d.createObjectStore('medications', { keyPath: 'name' });
                }

                if (!d.objectStoreNames.contains('labTests')) {
                    d.createObjectStore('labTests', { keyPath: 'name' });
                }

                if (d.objectStoreNames.contains('counters')) {
                    const store = tx.objectStore('counters');
                    const getReq = store.get('patientCounter');
                    getReq.onsuccess = () => {
                        if (!getReq.result) store.put({ name: 'patientCounter', value: 0 });
                    };
                }
            };

            req.onsuccess = (e) => {
                this.db = e.target.result;
                this.useLocalFallback = false;
                this.ready = true;
                this.db.onversionchange = () => {
                    this.db.close();
                    AppUtils.showError('تم تحديث التطبيق في نافذة أخرى. الرجاء تحديث الصفحة.', 10000);
                };
                resolve();
            };

            req.onerror = () => {
                this.useLocalFallback = true;
                this.ready = true;
                this.showFallbackBanner();
                resolve();
            };

            req.onblocked = () => {
                AppUtils.showError('التطبيق مفتوح في نافذة أخرى. الرجاء إغلاقه أولاً.');
            };
        });
    },

    /* ------------------------------------------------------------
       ترحيل البيانات من القواعد القديمة إلى الجديدة
       ------------------------------------------------------------ */
    async _migrateLegacyDatabases() {
        if (!window.indexedDB) return;

        for (const legacyName of LEGACY_DB_NAMES) {
            try {
                const exists = await this._databaseExists(legacyName);
                if (!exists) continue;

                const hasNew = await this._databaseExists(DB_NAME);
                if (hasNew) {
                    // القاعدة الجديدة موجودة — احذف القديمة فقط
                    await this._deleteDatabase(legacyName);
                    continue;
                }

                // انسخ البيانات من القاعدة القديمة
                const legacyData = await this._readAllFromLegacy(legacyName);
                if (legacyData) {
                    // احفظها مؤقتاً في sessionStorage وسيتم تحميلها بعد فتح القاعدة الجديدة
                    try {
                        sessionStorage.setItem('__migrated_data__', JSON.stringify(legacyData));
                    } catch (e) {
                        console.warn('فشل حفظ بيانات الترحيل مؤقتاً:', e);
                    }
                }
                await this._deleteDatabase(legacyName);
            } catch (err) {
                console.warn('فشل ترحيل القاعدة القديمة:', legacyName, err);
            }
        }

        // إن وُجدت بيانات مُرحّلة، اكتبها في القاعدة الجديدة بعد فتحها
        const migrated = sessionStorage.getItem('__migrated_data__');
        if (migrated) {
            // سنؤجل الكتابة حتى ينتهي open() — نستخدم ready flag
            setTimeout(async () => {
                try {
                    const data = JSON.parse(migrated);
                    await this._restoreMigrated(data);
                    sessionStorage.removeItem('__migrated_data__');
                    AppUtils.toast('تم ترحيل البيانات من الإصدار السابق', 'success', 5000);
                } catch (e) {
                    console.warn('فشل استرجاع بيانات الترحيل:', e);
                }
            }, 500);
        }
    },

    _databaseExists(name) {
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open(name);
                req.onsuccess = (e) => {
                    const db = e.target.result;
                    const hasStores = db.objectStoreNames.length > 0;
                    db.close();
                    resolve(hasStores);
                };
                req.onerror = () => resolve(false);
                req.onblocked = () => resolve(false);
            } catch {
                resolve(false);
            }
        });
    },

    _readAllFromLegacy(name) {
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open(name);
                req.onsuccess = (e) => {
                    const db = e.target.result;
                    const stores = ['patients', 'appointments', 'standalone', 'medications', 'labTests', 'auditLog'];
                    const result = {};
                    let pending = 0;
                    let done = false;

                    const finish = () => {
                        if (done) return;
                        done = true;
                        db.close();
                        resolve(result);
                    };

                    stores.forEach(storeName => {
                        if (!db.objectStoreNames.contains(storeName)) return;
                        pending++;
                        try {
                            const tx = db.transaction(storeName, 'readonly');
                            const store = tx.objectStore(storeName);
                            const getReq = store.getAll();
                            getReq.onsuccess = (ev) => {
                                result[storeName] = ev.target.result || [];
                                pending--;
                                if (pending <= 0) finish();
                            };
                            getReq.onerror = () => {
                                pending--;
                                if (pending <= 0) finish();
                            };
                        } catch {
                            pending--;
                            if (pending <= 0) finish();
                        }
                    });

                    if (pending === 0) finish();
                    setTimeout(finish, 3000); // timeout احتياطي
                };
                req.onerror = () => resolve(null);
                req.onblocked = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
    },

    async _restoreMigrated(data) {
        if (!this.db) return;
        const patients = data.patients || [];
        const appointments = data.appointments || [];
        const standalone = data.standalone || [];
        const medications = data.medications || [];
        const labTests = data.labTests || [];
        const auditLog = data.auditLog || [];

        await this.atomicSave({
            patients,
            appointments,
            standalone,
            medications,
            labTests
        });

        // استرجاع سجل التدقيق (لا حد أقصى)
        if (auditLog.length && this.db.objectStoreNames.contains('auditLog')) {
            await new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('auditLog', 'readwrite');
                    const store = tx.objectStore('auditLog');
                    auditLog.forEach(log => {
                        const { id, ...rest } = log;
                        store.add(rest);
                    });
                    tx.oncomplete = resolve;
                    tx.onerror = resolve;
                } catch {
                    resolve();
                }
            });
        }

        // استرجاع العدّاد
        const maxNum = patients.reduce((max, p) => {
            const m = (p.fileNo || '').match(/(\d+)$/);
            return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        if (maxNum > 0 && this.db.objectStoreNames.contains('counters')) {
            await new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('counters', 'readwrite');
                    tx.objectStore('counters').put({ name: 'patientCounter', value: maxNum });
                    tx.oncomplete = resolve;
                    tx.onerror = resolve;
                } catch {
                    resolve();
                }
            });
        }
    },

    _deleteDatabase(name) {
        return new Promise((resolve) => {
            try {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
            } catch {
                resolve();
            }
        });
    },

    /* ------------------------------------------------------------
       حذف كل بيانات التطبيق (كل الإصدارات)
       ------------------------------------------------------------ */
    async deleteAllDatabases() {
        // أغلق الاتصال الحالي
        if (this.db) {
            try { this.db.close(); } catch {}
            this.db = null;
        }

        const allNames = [DB_NAME, ...LEGACY_DB_NAMES];

        for (const name of allNames) {
            await new Promise((resolve) => {
                try {
                    const req = indexedDB.deleteDatabase(name);
                    req.onsuccess = () => resolve();
                    req.onerror = () => resolve();
                    req.onblocked = () => {
                        // حاول مجدداً بعد فترة قصيرة
                        setTimeout(() => resolve(), 500);
                    };
                } catch {
                    resolve();
                }
            });
        }

        // حذف كل مفاتيح localStorage المتعلقة بالتطبيق
        Object.keys(localStorage)
            .filter(k =>
                k.startsWith('عيادتي_') ||
                k.startsWith('clinic_') ||
                k.startsWith('counter_')
            )
            .forEach(k => {
                try { localStorage.removeItem(k); } catch {}
            });

        // حذف بيانات sessionStorage
        try {
            sessionStorage.clear();
        } catch {}
    },

    showFallbackBanner() {
        const banner = document.getElementById('storageFallbackBanner');
        if (banner) banner.classList.add('show');
    },

    async getNextSequence(name) {
        if (this.useLocalFallback || !this.db) {
            const key = 'counter_' + name;
            const c = parseInt(localStorage.getItem(key) || '0', 10) + 1;
            localStorage.setItem(key, c.toString());
            return c;
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('counters', 'readwrite');
            const store = tx.objectStore('counters');
            const req = store.get(name);
            req.onsuccess = (e) => {
                const c = e.target.result || { name, value: 0 };
                c.value++;
                store.put(c).onsuccess = () => resolve(c.value);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    },

    async generateFileNo() {
        const c = await this.getNextSequence('patientCounter');
        return 'CAR-' + new Date().getFullYear() + '-' + String(c).padStart(5, '0');
    },

    async getAll(storeName) {
        if (this.useLocalFallback || !this.db) {
            try {
                return JSON.parse(localStorage.getItem('عيادتي_' + storeName) || '[]');
            } catch {
                return [];
            }
        }
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = (e) => resolve(e.target.result || []);
            req.onerror = () => resolve([]);
        });
    },

    async searchPatients(query, maxResults = 8) {
        if (!query || !query.trim()) return [];
        const q = query.trim();

        if (this.useLocalFallback || !this.db) {
            const all = await this.getAll('patients');
            return all.filter(p => this._matchesPatient(p, q)).slice(0, maxResults);
        }

        return new Promise((resolve) => {
            const tx = this.db.transaction('patients', 'readonly');
            const store = tx.objectStore('patients');
            const results = new Map();
            const lowerQ = q.toLowerCase();
            const upperQ = lowerQ + '\uffff';

            const addResult = (p) => {
                if (p && p.fileNo && !results.has(p.fileNo)) {
                    results.set(p.fileNo, p);
                }
            };

            let pending = 0;
            const done = () => {
                pending--;
                if (pending <= 0) {
                    resolve(Array.from(results.values()).slice(0, maxResults));
                }
            };

            pending++;
            const nameRange = IDBKeyRange.bound(lowerQ, upperQ, false, false);
            const nameReq = store.index('nameIdx').openCursor(nameRange);
            nameReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (!cursor || results.size >= maxResults) { done(); return; }
                addResult(cursor.value);
                cursor.continue();
            };
            nameReq.onerror = () => done();

            if (/^[0-9+\-\s]+$/.test(q)) {
                pending++;
                const phoneRange = IDBKeyRange.bound(q, q + '\uffff', false, false);
                const phoneReq = store.index('phoneIdx').openCursor(phoneRange);
                phoneReq.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (!cursor || results.size >= maxResults) { done(); return; }
                    addResult(cursor.value);
                    cursor.continue();
                };
                phoneReq.onerror = () => done();
            }

            if (q.length >= 2) {
                pending++;
                const fileRange = IDBKeyRange.bound(lowerQ, upperQ, false, false);
                const fileReq = store.openCursor(fileRange);
                fileReq.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (!cursor || results.size >= maxResults) { done(); return; }
                    addResult(cursor.value);
                    cursor.continue();
                };
                fileReq.onerror = () => done();
            }
        });
    },

    _matchesPatient(p, q) {
        const lowerQ = q.toLowerCase();
        if (p.name && p.name.toLowerCase().includes(lowerQ)) return true;
        if (p.fileNo && p.fileNo.toLowerCase().includes(lowerQ)) return true;
        if (p.phone && p.phone.includes(q)) return true;
        return false;
    },

    async saveAll(storeName, items, options = {}) {
        const { replaceAll = true } = options;

        if (this.useLocalFallback || !this.db) {
            try {
                if (replaceAll) {
                    localStorage.setItem('عيادتي_' + storeName, JSON.stringify(items));
                } else {
                    const existing = JSON.parse(localStorage.getItem('عيادتي_' + storeName) || '[]');
                    const map = new Map(existing.map(x => [x.fileNo || x.name || x.id, x]));
                    items.forEach(x => map.set(x.fileNo || x.name || x.id, x));
                    localStorage.setItem('عيادتي_' + storeName, JSON.stringify(Array.from(map.values())));
                }
            } catch (e) {
                if (e.name === 'QuotaExceededError') {
                    throw new Error('مساحة التخزين ممتلئة. احذف بعض الصور أو صدّر البيانات.');
                }
                throw e;
            }
            return;
        }

        return new Promise((resolve, reject) => {
            let tx;
            try {
                tx = this.db.transaction(storeName, 'readwrite');
            } catch (e) {
                reject(e);
                return;
            }
            const store = tx.objectStore(storeName);
            const keyPath = store.keyPath;

            try {
                if (replaceAll) {
                    const req = store.getAllKeys();
                    req.onsuccess = (e) => {
                        const existing = new Set(e.target.result);
                        const nw = new Set(items.map(x => x[keyPath]));
                        existing.forEach(k => {
                            if (!nw.has(k)) store.delete(k);
                        });
                        items.forEach(x => store.put(x));
                    };
                } else {
                    items.forEach(x => store.put(x));
                }
            } catch (err) {
                reject(err);
                return;
            }

            tx.oncomplete = () => resolve();
            tx.onerror = () => {
                const err = tx.error;
                if (err && err.name === 'QuotaExceededError') {
                    reject(new Error('مساحة التخزين ممتلئة. احذف بعض الصور أو صدّر البيانات.'));
                } else {
                    reject(err);
                }
            };
            tx.onabort = () => reject(tx.error || new Error('فشلت المعاملة'));
        });
    },

    async atomicSave({ patients, appointments, standalone, medications, labTests }) {
        if (this.useLocalFallback || !this.db) {
            if (patients) await this.saveAll('patients', patients);
            if (appointments) await this.saveAll('appointments', appointments);
            if (standalone) await this.saveAll('standalone', standalone);
            if (medications) await this.saveAll('medications', medications);
            if (labTests) await this.saveAll('labTests', labTests);
            return;
        }

        const stores = [];
        if (patients) stores.push('patients');
        if (appointments) stores.push('appointments');
        if (standalone) stores.push('standalone');
        if (medications) stores.push('medications');
        if (labTests) stores.push('labTests');

        if (!stores.length) return;

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(stores, 'readwrite');

            const putStore = (name, items) => {
                if (!items) return;
                const store = tx.objectStore(name);
                const keyPath = store.keyPath;
                const req = store.getAllKeys();
                req.onsuccess = (e) => {
                    const existing = new Set(e.target.result);
                    const nw = new Set(items.map(x => x[keyPath]));
                    existing.forEach(k => {
                        if (!nw.has(k)) store.delete(k);
                    });
                    items.forEach(x => store.put(x));
                };
            };

            try {
                putStore('patients', patients);
                putStore('appointments', appointments);
                putStore('standalone', standalone);
                putStore('medications', medications);
                putStore('labTests', labTests);
            } catch (err) {
                reject(err);
                return;
            }

            tx.oncomplete = () => resolve();
            tx.onerror = () => {
                const err = tx.error;
                if (err && err.name === 'QuotaExceededError') {
                    reject(new Error('مساحة التخزين ممتلئة.'));
                } else {
                    reject(err);
                }
            };
            tx.onabort = () => reject(tx.error || new Error('فشلت المعاملة الذرّية'));
        });
    },

    /* ------------------------------------------------------------
       سجل التدقيق — بدون أي حد أقصى
       ------------------------------------------------------------ */
    async addAuditLog(action, details, target = '') {
        const entry = { action, details, target, timestamp: AppUtils.nowISO() };
        if (this.useLocalFallback || !this.db) {
            try {
                const logs = JSON.parse(localStorage.getItem('عيادتي_auditLog') || '[]');
                logs.push(entry);
                // ✅ إزالة الحد الأقصى — نحفظ كل السجل
                localStorage.setItem('عيادتي_auditLog', JSON.stringify(logs));
            } catch { /* تجاهل */ }
            return;
        }
        return new Promise((resolve) => {
            const tx = this.db.transaction('auditLog', 'readwrite');
            tx.objectStore('auditLog').add(entry);
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    },

    /* ✅ getAuditLogs بدون حد افتراضي — يرجّع كل السجل */
    async getAuditLogs(limit = Infinity) {
        if (this.useLocalFallback || !this.db) {
            try {
                const logs = JSON.parse(localStorage.getItem('عيادتي_auditLog') || '[]');
                const reversed = logs.slice().reverse();
                return limit === Infinity ? reversed : reversed.slice(0, limit);
            } catch {
                return [];
            }
        }
        return new Promise((resolve) => {
            const tx = this.db.transaction('auditLog', 'readonly');
            const store = tx.objectStore('auditLog');
            const logs = [];
            store.openCursor(null, 'prev').onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor && logs.length < limit) {
                    logs.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(logs);
                }
            };
        });
    },

    async clearAuditLogs() {
        if (this.useLocalFallback || !this.db) {
            localStorage.removeItem('عيادتي_auditLog');
            return;
        }
        return new Promise((resolve) => {
            const tx = this.db.transaction('auditLog', 'readwrite');
            tx.objectStore('auditLog').clear();
            tx.oncomplete = resolve;
        });
    },

    async saveVisitImages(visitId, images) {
        if (!images?.length) return [];
        if (this.useLocalFallback || !this.db) {
            return images.slice();
        }
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('imagesStore', 'readwrite');
            const store = tx.objectStore('imagesStore');
            const ids = new Array(images.length);
            let errorOccurred = null;

            images.forEach((img, i) => {
                const compositeKey = `${visitId}:${String(i).padStart(6, '0')}:${AppUtils.generateId()}`;
                ids[i] = compositeKey;
                const req = store.put({
                    compositeKey,
                    visitId,
                    order: i,
                    data: img,
                    createdAt: AppUtils.nowISO()
                });
                req.onerror = (e) => {
                    errorOccurred = e.target.error;
                };
            });

            tx.oncomplete = () => resolve(ids);
            tx.onerror = () => {
                const err = tx.error;
                if (err && err.name === 'QuotaExceededError') {
                    reject(new Error('مساحة التخزين ممتلئة — لم تُحفظ الصور.'));
                } else {
                    reject(errorOccurred || err || new Error('فشل حفظ الصور'));
                }
            };
            tx.onabort = () => reject(tx.error || new Error('أُلغيت معاملة حفظ الصور'));
        });
    },

    async getVisitImages(imageIds) {
        if (!imageIds?.length) return [];
        if (this.useLocalFallback || !this.db) {
            return imageIds.slice();
        }
        return new Promise((resolve) => {
            const tx = this.db.transaction('imagesStore', 'readonly');
            const store = tx.objectStore('imagesStore');
            const results = new Array(imageIds.length).fill(null);

            imageIds.forEach((key, i) => {
                const req = store.get(key);
                req.onsuccess = () => {
                    if (req.result && req.result.data) results[i] = req.result.data;
                };
            });

            tx.oncomplete = () => resolve(results);
            tx.onerror = () => resolve(results);
        });
    },

    async deleteVisitImages(imageIds) {
        if (!imageIds?.length) return;
        if (this.useLocalFallback || !this.db) return;
        return new Promise((resolve) => {
            const tx = this.db.transaction('imagesStore', 'readwrite');
            const store = tx.objectStore('imagesStore');
            imageIds.forEach(id => {
                if (id) store.delete(id);
            });
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    },

    async getMedications() {
        if (this.useLocalFallback || !this.db) {
            try {
                return JSON.parse(localStorage.getItem('عيادتي_meds') || '[]');
            } catch {
                return [];
            }
        }
        return new Promise(resolve => {
            const tx = this.db.transaction('medications', 'readonly');
            const req = tx.objectStore('medications').getAll();
            req.onsuccess = (e) => resolve(e.target.result || []);
            req.onerror = () => resolve([]);
        });
    },

    async saveMedication(med) {
        if (!med || !med.name) return;
        if (this.useLocalFallback || !this.db) {
            const meds = JSON.parse(localStorage.getItem('عيادتي_meds') || '[]');
            const idx = meds.findIndex(m => m.name === med.name);
            if (idx >= 0) meds[idx] = med;
            else meds.push(med);
            localStorage.setItem('عيادتي_meds', JSON.stringify(meds));
            return;
        }
        return new Promise(resolve => {
            const tx = this.db.transaction('medications', 'readwrite');
            tx.objectStore('medications').put(med);
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    },

    async deleteMedication(name) {
        if (!name) return;
        if (this.useLocalFallback || !this.db) {
            const meds = JSON.parse(localStorage.getItem('عيادتي_meds') || '[]');
            localStorage.setItem('عيادتي_meds', JSON.stringify(meds.filter(m => m.name !== name)));
            return;
        }
        return new Promise(resolve => {
            const tx = this.db.transaction('medications', 'readwrite');
            tx.objectStore('medications').delete(name);
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    },

    async getLabTests() {
        if (this.useLocalFallback || !this.db) {
            try {
                return JSON.parse(localStorage.getItem('عيادتي_labTests') || '[]');
            } catch {
                return [];
            }
        }
        return new Promise(resolve => {
            const tx = this.db.transaction('labTests', 'readonly');
            const req = tx.objectStore('labTests').getAll();
            req.onsuccess = (e) => resolve(e.target.result || []);
            req.onerror = () => resolve([]);
        });
    },

    async saveLabTest(test) {
        if (!test || !test.name) return;
        if (this.useLocalFallback || !this.db) {
            const tests = JSON.parse(localStorage.getItem('عيادتي_labTests') || '[]');
            const idx = tests.findIndex(t => t.name === test.name);
            if (idx >= 0) tests[idx] = test;
            else tests.push(test);
            localStorage.setItem('عيادتي_labTests', JSON.stringify(tests));
            return;
        }
        return new Promise(resolve => {
            const tx = this.db.transaction('labTests', 'readwrite');
            tx.objectStore('labTests').put(test);
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    },

    async deleteLabTest(name) {
        if (!name) return;
        if (this.useLocalFallback || !this.db) {
            const tests = JSON.parse(localStorage.getItem('عيادتي_labTests') || '[]');
            localStorage.setItem('عيادتي_labTests', JSON.stringify(tests.filter(t => t.name !== name)));
            return;
        }
        return new Promise(resolve => {
            const tx = this.db.transaction('labTests', 'readwrite');
            tx.objectStore('labTests').delete(name);
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    },

    async estimateUsage() {
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const est = await navigator.storage.estimate();
                return { usage: est.usage || 0, quota: est.quota || 0 };
            } catch {
                return { usage: 0, quota: 0 };
            }
        }
        return { usage: 0, quota: 0 };
    }
};

window.DB = DB;
window.DB_NAME = DB_NAME;