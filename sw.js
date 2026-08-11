// =========================================================
// Skyline — service worker
// Caches the app shell so the dashboard still opens offline. Weather payloads
// are NOT cached here — script.js keeps the last successful response in
// localStorage and renders it with a "cached" note, which keeps the freshness
// story in one place.
// =========================================================

const CACHE = "skyline-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll fails the whole install if any single request 404s, so add
      // entries individually and tolerate misses.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept the API: stale weather served silently would be a lie.
  if (url.hostname.endsWith("openweathermap.org")) return;

  // Same-origin shell → network-first with a cache fallback, so a deployed
  // update is picked up immediately but offline still works.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => null);
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  // Cross-origin (Google Fonts) → cache-first; these URLs are content-versioned.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => null);
        }
        return response;
      });
      // No fallback: if a font can't load offline the page still renders in the
      // system font, which is better than serving an empty Response.
    })
  );
});
