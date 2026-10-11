
"use strict";

const CACHE_NAME = "quova-hub-v4";
const DATA_CACHE_NAME = "quova-data-v4";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./data/packages.json",
  "./data/installers.json"
];

const OFFLINE_PAGE = "./index.html";

/* INSTALL */
self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Cache files individually so one missing file
      // does not prevent all other files from caching.
      const results = await Promise.allSettled(
        APP_FILES.map(async file => {
          const response = await fetch(file, {
            cache: "reload"
          });

          if (!response.ok) {
            throw new Error(
              `Failed to cache ${file}: HTTP ${response.status}`
            );
          }

          await cache.put(file, response);
        })
      );

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn(
            `[Quova SW] Could not cache ${APP_FILES[index]}:`,
            result.reason
          );
        }
      });

      console.info("[Quova SW] Installation cache prepared.");

      // Activate the new worker immediately.
      await self.skipWaiting();
    })()
  );
});

/* ACTIVATE */
self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter(name =>
            name.startsWith("quova-") &&
            name !== CACHE_NAME &&
            name !== DATA_CACHE_NAME
          )
          .map(name => caches.delete(name))
      );

      await self.clients.claim();

      console.info("[Quova SW] Quova Hub is active.");
    })()
  );
});

/* HELPERS */
function isAppData(url) {
  return (
    url.pathname.endsWith("/data/packages.json") ||
    url.pathname.endsWith("/data/installers.json")
  );
}

function isInstallerFile(url) {
  return url.pathname.includes("/installers/");
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);

    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request);

    if (cached) {
      console.info(
        "[Quova SW] Using cached data:",
        new URL(request.url).pathname
      );

      return cached;
    }

    throw error;
  }
}

async function staticAssetFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
  }

  return response;
}

/* FETCH */
self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Handle only same-origin requests.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache installer binaries. They can be very large.
  // The app can still download a local installer normally.
  if (isInstallerFile(url)) {
    return;
  }

  // HTML navigation: try the network first, then the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch (error) {
          const cache = await caches.open(CACHE_NAME);

          return (
            await cache.match(OFFLINE_PAGE) ||
            await cache.match("./") ||
            Response.error()
          );
        }
      })()
    );

    return;
  }

  // JSON catalog and installer registry: network-first.
  if (isAppData(url)) {
    event.respondWith(
      networkFirst(request, DATA_CACHE_NAME).catch(async () => {
        return (
          await caches.match(request) ||
          new Response(
            JSON.stringify({
              error: "Data unavailable offline"
            }),
            {
              status: 503,
              headers: {
                "Content-Type": "application/json"
              }
            }
          )
        );
      })
    );

    return;
  }

  // Static assets: cache-first with network fallback.
  event.respondWith(
    staticAssetFirst(request).catch(async () => {
      const cached = await caches.match(request);

      if (cached) {
        return cached;
      }

      return Response.error();
    })
  );
});
