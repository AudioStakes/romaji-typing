const CACHE_NAME = "romajiuchi-v2";

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./assets/css/style.css",
  "./assets/js/app.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(ASSETS_TO_CACHE.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "no-cache" });
        if (response && response.ok) {
          await cache.put(url, response.clone());
        }
      } catch (_error) {
        // アイコン未配置などは無視して、アプリ全体のインストール失敗を避ける
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key !== CACHE_NAME) {
        return caches.delete(key);
      }
      return Promise.resolve();
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const networkResponse = await fetch(event.request);
      if (networkResponse && networkResponse.ok) {
        cache.put(event.request, networkResponse.clone());
      }
      return networkResponse;
    } catch (_error) {
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) return cachedResponse;
      if (event.request.mode === "navigate") {
        const cachedRoot = await cache.match("./index.html") || await cache.match("./");
        if (cachedRoot) return cachedRoot;
      }
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});
