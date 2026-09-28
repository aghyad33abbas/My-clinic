/* ============================================================
   sw.js - Service Worker
   ============================================================ */
const CACHE_NAME = 'عيادتي-cache-v11';

const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/styles.css',
    './css/lab-tests.css',
    './js/utils.js',
    './js/db.js',
    './js/ui-utils.js',
    './js/patients.js',
    './js/visits.js',
    './js/calendar.js',
    './js/medications.js',
    './js/labTests.js',
    './js/backup.js',
    './js/app.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(c => c.addAll(CORE_ASSETS).catch(err => {
                console.warn('[SW] بعض الأصول فشلت في التخزين المؤقت:', err);
            }))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(names => Promise.all(
                names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);
    if (url.origin !== location.origin) return;

    if (e.request.mode === 'navigate' || e.request.destination === 'document') {
        e.respondWith(
            fetch(e.request)
                .then(res => {
                    if (res && res.status === 200) {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
                    }
                    return res;
                })
                .catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
        );
        return;
    }

    e.respondWith(
        caches.match(e.request).then(cached => {
            const fetchPromise = fetch(e.request)
                .then(res => {
                    if (res && res.status === 200 && res.type === 'basic') {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
                    }
                    return res;
                })
                .catch(() => cached);
            return cached || fetchPromise;
        })
    );
});

self.addEventListener('message', (e) => {
    if (e.data === 'SKIP_WAITING') self.skipWaiting();
});