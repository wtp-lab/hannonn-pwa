const CACHE_NAME = 'hanon-app-v2';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './questions.csv'
];

// Install: Cache core assets (including CSV)
self.addEventListener('install', (e) => {
    console.log('[Service Worker] Install');
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching all: app shell and content');
            return cache.addAll(ASSETS);
        })
    );
});

// Fetch: Strategy depends on file type
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Strategy for CSV: Network First -> Cache Fallback
    // This ensures users get the latest questions if online, but can still practice offline.
    if (url.pathname.endsWith('questions.csv')) {
        e.respondWith(
            fetch(e.request)
                .then((response) => {
                    // Update cache with new version
                    const clonedResponse = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, clonedResponse);
                    });
                    return response;
                })
                .catch(() => {
                    // Offline? Return cached version
                    console.log('[Service Worker] Serving CSV from cache (offline)');
                    return caches.match(e.request);
                })
        );
        return;
    }

    // Strategy for App Shell (HTML, CSS, JS): Cache First -> Network Fallback
    // This makes the app load instantly.
    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        })
    );
});

// Activate: Clean up old caches if necessary
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
});
