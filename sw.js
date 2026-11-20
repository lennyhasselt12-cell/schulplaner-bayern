/* Schulplaner Bayern – PWA service worker.
   Same-origin app files are fetched network-first so GitHub Pages updates
   appear on the next visit; cached files are the offline fallback. */
const CACHE_NAME = "schulplaner-shell-v1";
const APP_SHELL = ["./", "./index.html", "./style.css", "./script.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"];
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async (path) => {
      const response = await fetch(path, { cache: "reload" });
      if (!response.ok) throw new Error("PWA-Datei konnte nicht vorgeladen werden: " + path);
      await cache.put(path, response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("schulplaner-shell-") && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request, { cache: "no-store" });
      if (response && response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
        if (request.mode === "navigate") await cache.put(new URL("./", self.registration.scope).toString(), response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") return (await cache.match("./")) || (await cache.match("./index.html"));
      throw error;
    }
  })());
});
