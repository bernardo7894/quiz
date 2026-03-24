/*
 * Cross-Origin Isolation Service Worker
 *
 * Injects Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers
 * into every response, enabling SharedArrayBuffer (required for multi-threaded
 * WASM used by @huggingface/transformers) on hosts like GitHub Pages that
 * cannot set custom HTTP response headers.
 *
 * Registers itself, then triggers a page reload so the first real load already
 * runs under the service worker's modified headers.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
);

self.addEventListener("fetch", (event) => {
  // Skip opaque requests that would break with CORP enforcement
  if (
    event.request.cache === "only-if-cached" &&
    event.request.mode !== "same-origin"
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Pass through error / opaque responses unchanged
        if (response.status === 0) {
          return response;
        }

        const newHeaders = new Headers(response.headers);
        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
        newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
        newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      })
      .catch((err) => {
        console.warn("COI service worker: fetch failed, retrying without modification:", err);
        return fetch(event.request);
      })
  );
});
