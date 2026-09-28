/* ============================================================
   tests.js - اختبارات وحدة (تُشغَّل يدوياً عبر ?test=1)
   ============================================================ */
'use strict';

(function () {
    const results = {
        passed: 0,
        failed: 0,
        details: []
    };

    function assert(condition, testName) {
        if (condition) {
            results.passed++;
            results.details.push({ name: testName, status: '✅ PASS' });
        } else {
            results.failed++;
            results.details.push({ name: testName, status: '❌ FAIL' });
        }
    }

    function assertEqual(actual, expected, testName) {
        const ok = JSON.stringify(actual) === JSON.stringify(expected);
        if (ok) {
            results.passed++;
            results.details.push({ name: testName, status: '✅ PASS' });
        } else {
            results.failed++;
            results.details.push({
                name: testName,
                status: '❌ FAIL',
                expected,
                actual
            });
        }
    }

    /* ------------------------------------------------------------
       اختبارات AppUtils
       ------------------------------------------------------------ */
    async function testAppUtils() {
        // validateBP
        assert(AppUtils.validateBP('120/80') === true, 'validateBP: 120/80 صالح');
        assert(AppUtils.validateBP('140/90') === true, 'validateBP: 140/90 صالح');
        assert(AppUtils.validateBP('') === true, 'validateBP: فارغ = صالح');
        assert(AppUtils.validateBP('120') === false, 'validateBP: بدون / غير صالح');
        assert(AppUtils.validateBP('80/120') === false, 'validateBP: معكوس غير صالح');
        assert(AppUtils.validateBP('999/80') === false, 'validateBP: systole مرتفع جداً');
        assert(AppUtils.validateBP('120/999') === false, 'validateBP: diastole مرتفع جداً');

        // validateAge
        assert(AppUtils.validateAge('') === true, 'validateAge: فارغ صالح');
        assert(AppUtils.validateAge('30') === true, 'validateAge: 30 صالح');
        assert(AppUtils.validateAge('0') === true, 'validateAge: 0 صالح');
        assert(AppUtils.validateAge('120') === true, 'validateAge: 120 صالح');
        assert(AppUtils.validateAge('121') === false, 'validateAge: 121 غير صالح');
        assert(AppUtils.validateAge('-5') === false, 'validateAge: سالب غير صالح');
        assert(AppUtils.validateAge('abc') === false, 'validateAge: نص غير صالح');

        // validatePhone
        assert(AppUtils.validatePhone('') === true, 'validatePhone: فارغ مقبول');
        assert(AppUtils.validatePhone('0999999999') === true, 'validatePhone: رقم صالح');
        assert(AppUtils.validatePhone('+963999999999') === true, 'validatePhone: دولي');
        assert(AppUtils.validatePhone('123') === true, 'validatePhone: قصير مقبول');
        assert(AppUtils.validatePhone('abc12345') === true, 'validatePhone: حروف مقبولة');
        assert(AppUtils.validatePhone('أي شيء!!') === true, 'validatePhone: أي نص مقبول');

        // sanitize
        assert(AppUtils.sanitize('<script>alert(1)</script>') ===
            '&lt;script&gt;alert(1)&lt;/script&gt;', 'sanitize: يمنع HTML');

        assert(AppUtils.sanitizeAttribute('"test"') === '&quot;test&quot;',
            'sanitizeAttribute: يمنع quotes');

        // generateId
        const id1 = AppUtils.generateId();
        const id2 = AppUtils.generateId();
        assert(id1 !== id2, 'generateId: ينتج معرّفات فريدة');
        assert(typeof id1 === 'string' && id1.length > 10, 'generateId: سلسلة طويلة');

        // getMonthYear
        assert(AppUtils.getMonthYear('2025-03-15') === '2025-03',
            'getMonthYear: تنسيق صحيح');

        // todayISO
        const today = AppUtils.todayISO();
        assert(/^\d{4}-\d{2}-\d{2}$/.test(today), 'todayISO: تنسيق YYYY-MM-DD');
    }

    /* ------------------------------------------------------------
       اختبارات Crypto
       ------------------------------------------------------------ */
    async function testCrypto() {
        assert(typeof Crypto.isSupported() === 'boolean', 'Crypto.isSupported: يرجع boolean');

        if (!Crypto.isSupported()) {
            results.details.push({
                name: 'Crypto: تم تخطي الاختبارات (غير مدعوم)',
                status: '⚠️ SKIP'
            });
            return;
        }

        const bytes = new Uint8Array([1, 2, 3, 255, 128, 0]);
        const b64 = Crypto._b64encode(bytes);
        const decoded = Crypto._b64decode(b64);
        assertEqual(Array.from(decoded), Array.from(bytes),
            'Crypto._b64: encode/decode متطابقان');

        const testKeyBytes = crypto.getRandomValues(new Uint8Array(32));
        const testKey = await crypto.subtle.importKey(
            'raw',
            testKeyBytes,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        const savedKey = Crypto.key;
        Crypto.key = testKey;

        try {
            const plaintext = 'نص اختباري عربي 123 !@#';
            const encrypted = await Crypto.encrypt(plaintext);
            assert(encrypted.iv && encrypted.ct, 'Crypto.encrypt: ينتج iv و ct');

            const decrypted = await Crypto.decrypt(encrypted);
            assertEqual(decrypted, plaintext, 'Crypto: التشفير/فك التشفير متطابقان');

            const obj = { name: 'محمد', age: 30, tags: ['a', 'b'] };
            const encJSON = await Crypto.encryptJSON(obj);
            const decJSON = await Crypto.decryptJSON(encJSON);
            assertEqual(decJSON, obj, 'Crypto: تشفير/فك JSON متطابقان');

            const e1 = await Crypto.encrypt('same');
            const e2 = await Crypto.encrypt('same');
            assert(e1.iv !== e2.iv, 'Crypto: IV مختلف في كل تشفير');
            assert(e1.ct !== e2.ct, 'Crypto: النص المشفّر مختلف (بسبب IV)');
        } finally {
            Crypto.key = savedKey;
        }
    }

    /* ------------------------------------------------------------
       اختبارات Merge (backup.js)
       ------------------------------------------------------------ */
    function testMerge() {
        // mergeVisits
        const v1 = { id: 'v1', date: '2025-01-01', diag: 'cold', imageIds: ['a'] };
        const v2 = { id: 'v2', date: '2025-02-01', diag: 'flu', imageIds: ['b'] };
        const v3 = { id: 'v1', date: '2025-01-01', diag: 'cold', imageIds: ['c'] };

        const mergedVisits = mergeVisits([v1, v2], [v3]);
        assertEqual(mergedVisits.length, 2, 'mergeVisits: يمنع التكرار');

        const mergedV1 = mergedVisits.find(v => v.id === 'v1');
        assertEqual(mergedV1.imageIds.sort(), ['a', 'c'].sort(),
            'mergeVisits: يدمج imageIds');

        // mergeAppointments
        const a1 = { id: 1, fileNo: 'F1', date: '2025-01-01', time: '10:00' };
        const a2 = { id: 2, fileNo: 'F1', date: '2025-02-01', time: '11:00' };
        const a3 = { id: 1, fileNo: 'F1', date: '2025-01-01', time: '10:00', createdAt: '2025-01-02' };

        const mergedApps = mergeAppointments([a1, a2], [a3]);
        assertEqual(mergedApps.length, 2, 'mergeAppointments: يمنع التكرار');

        // mergeStandalone
        const s1 = { id: 10, patientName: 'X', date: '2025-01-01', time: '09:00' };
        const s2 = { id: 11, patientName: 'Y', date: '2025-01-01', time: '10:00' };
        const s3 = { id: 10, patientName: 'X', date: '2025-01-01', time: '09:00' };

        const mergedSta = mergeStandalone([s1, s2], [s3]);
        assertEqual(mergedSta.length, 2, 'mergeStandalone: يمنع التكرار');

        // Merge مع قوائم فارغة
        assertEqual(mergeVisits([], []), [], 'mergeVisits: قوائم فارغة');
        assertEqual(mergeVisits(null, null), [], 'mergeVisits: null آمن');
        assertEqual(mergeVisits(undefined, [v1]).length, 1, 'mergeVisits: undefined آمن');
    }

    /* ------------------------------------------------------------
       ✅ اختبارات mergeLabTests (جديد)
       ------------------------------------------------------------ */
    function testMergeLabTests() {
        const t1 = { name: 'سكر صائم', date: '2025-01-15', result: '105' };
        const t2 = { name: 'كولسترول', date: '2025-01-15', result: '220' };
        const t3 = { name: 'سكر صائم', date: '2025-01-15', result: '105' }; // مكرر
        const t4 = { name: 'سكر صائم', date: '2025-02-15', result: '95' };  // نفس الاسم، تاريخ مختلف

        // يمنع التكرار
        assertEqual(mergeLabTests([t1, t2], [t3]).length, 2,
            'mergeLabTests: يمنع التكرار بنفس الاسم والتاريخ');

        // يسمح بنفس الاسم بتاريخ مختلف
        assertEqual(mergeLabTests([t1], [t4]).length, 2,
            'mergeLabTests: يسمح بنفس الاسم بتاريخ مختلف');

        // الحماية من null/undefined
        assertEqual(mergeLabTests(null, null), [], 'mergeLabTests: null آمن');
        assertEqual(mergeLabTests(undefined, undefined), [], 'mergeLabTests: undefined آمن');
        assertEqual(mergeLabTests([], [t1]).length, 1, 'mergeLabTests: فارغ + جديد');
        assertEqual(mergeLabTests([t1], []).length, 1, 'mergeLabTests: قديم + فارغ');

        // تحليل بدون تاريخ
        const noDate1 = { name: 'CBC', result: 'طبيعي' };
        const noDate2 = { name: 'CBC', result: 'طبيعي' };
        assertEqual(mergeLabTests([noDate1], [noDate2]).length, 1,
            'mergeLabTests: تحاليل بدون تاريخ تُعتبر مكررة');

        // تجاهل المدخلات بدون اسم
        assertEqual(mergeLabTests([t1], [null, undefined, {}]).length, 1,
            'mergeLabTests: يتجاهل المدخلات بدون اسم بأمان');

        // تحديث البيانات عند وجود نتيجة أفضل
        const oldTest = { name: 'سكر صائم', date: '2025-01-15' };
        const newTest = { name: 'سكر صائم', date: '2025-01-15', result: '105', notes: 'ملاحظة' };
        const updated = mergeLabTests([oldTest], [newTest]);
        assertEqual(updated.length, 1, 'mergeLabTests: دمج بنفس المفتاح');
        assert(updated[0].result === '105', 'mergeLabTests: يستبدل بالنسخة الأكمل');
    }

    /* ------------------------------------------------------------
       اختبارات DB Helpers
       ------------------------------------------------------------ */
    async function testDBHelpers() {
        const p = { name: 'محمد أحمد', fileNo: 'CAR-2025-00001', phone: '0999999999' };

        assert(DB._matchesPatient(p, 'محمد') === true, 'DB: مطابقة اسم جزئي');
        assert(DB._matchesPatient(p, 'CAR') === true, 'DB: مطابقة fileNo');
        assert(DB._matchesPatient(p, '0999') === true, 'DB: مطابقة هاتف');
        assert(DB._matchesPatient(p, 'علي') === false, 'DB: لا يطابق نصاً غير موجود');
    }

    /* ------------------------------------------------------------
       تشغيل كل الاختبارات
       ------------------------------------------------------------ */
    window.runAllTests = async function runAllTests() {
        console.group('🧪 بدء الاختبارات');
        results.passed = 0;
        results.failed = 0;
        results.details = [];

        try {
            await testAppUtils();
            await testCrypto();
            testMerge();
            testMergeLabTests();   // ✅ اختبار mergeLabTests
            await testDBHelpers();
        } catch (err) {
            console.error('فشل تشغيل الاختبارات:', err);
        }

        console.groupEnd();

        console.group(`📊 النتائج: ${results.passed} نجح / ${results.failed} فشل`);
        results.details.forEach(d => {
            if (d.status.includes('FAIL')) {
                console.error(`${d.status} — ${d.name}`, d.expected ? { expected: d.expected, actual: d.actual } : '');
            } else {
                console.log(`${d.status} — ${d.name}`);
            }
        });
        console.groupEnd();

        const summary = {
            passed: results.passed,
            failed: results.failed,
            total: results.passed + results.failed,
            details: results.details
        };

        if (results.failed === 0) {
            console.log('%c✅ كل الاختبارات نجحت!',
                'background:#27ae60;color:#fff;padding:6px 12px;border-radius:4px;font-weight:bold;');
        } else {
            console.log(`%c❌ ${results.failed} اختبار(ات) فشلت`,
                'background:#c0392b;color:#fff;padding:6px 12px;border-radius:4px;font-weight:bold;');
        }

        return summary;
    };
})();