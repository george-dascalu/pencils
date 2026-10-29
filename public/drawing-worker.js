const CACHE = "pencils-drawing-shell-v5";
const files = [
  "/drawing-offline.html",
  "/drawing-offline.js",
  "/uuid.js",
  "/drawing-store.js",
  "/ink-capture.js",
  "/ink-preview.js",
  "/pen-model.js",
  "/ink-smoothing.js",
  "/color-picker.js",
  "/color-model.js",
  "/popover-position.js",
  "/styles.css",
  "/appearance.css",
  "/selection-toolbar.css",
  "/drawing-offline.css",
  "/icon.svg",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(files))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith("pencils-drawing-shell-") && key !== CACHE,
              )
              .map((key) => caches.delete(key)),
          ),
        ),
    ]),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !files.includes(url.pathname)
  )
    return;
  // Serve the prepared shell immediately, even if the network is slow or the
  // operating system has declared it offline. Refresh assets in the background.
  const update = fetch(event.request).then(async (response) => {
    if (response.ok) {
      const copy = response.clone();
      const cache = await caches.open(CACHE);
      await cache.put(event.request, copy);
    }
    return response;
  });
  event.waitUntil(update.catch(() => {}));
  event.respondWith(
    caches.match(event.request).then((cached) => cached || update),
  );
});
