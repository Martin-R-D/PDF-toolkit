// Bump this to invalidate old caches on deploy.
const CACHE_VERSION = "v1";
const CACHE = `localpdf-${CACHE_VERSION}`;

// App shell + the pdf.js worker, precached so the app works offline.
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/pdf.worker.min.mjs",
  "/icon-192.png",
  "/icon-512.png",
  "/og-image.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Cache-first for same-origin GET requests, falling back to the network and
// then to the cached app shell for navigations.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          req.mode === "navigate" ? caches.match("/") : Promise.reject()
        );
    })
  );
});
