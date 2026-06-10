const CACHE_NAME = "photocours-app-v38";
const APP_FILES = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg"
];
const BADGE_DB = "photocours-badge";
const BADGE_STORE = "badge";
const BADGE_KEY = "received";

function openBadgeDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BADGE_DB, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(BADGE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredBadgeCount() {
  const db = await openBadgeDb();

  return new Promise((resolve) => {
    const request = db.transaction(BADGE_STORE, "readonly").objectStore(BADGE_STORE).get(BADGE_KEY);
    request.onsuccess = () => resolve(Number(request.result) || 0);
    request.onerror = () => resolve(0);
  });
}

async function storeBadgeCount(count) {
  const db = await openBadgeDb();

  return new Promise((resolve) => {
    const request = db.transaction(BADGE_STORE, "readwrite").objectStore(BADGE_STORE).put(count, BADGE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

async function setIconBadge(count) {
  await storeBadgeCount(count);

  if ("setAppBadge" in self.registration && count > 0) {
    await self.registration.setAppBadge(count).catch(() => {});
  }

  if ("clearAppBadge" in self.registration && count <= 0) {
    await self.registration.clearAppBadge().catch(() => {});
  }
}

async function incrementIconBadge() {
  const nextCount = await getStoredBadgeCount() + 1;
  await setIconBadge(nextCount);
  return nextCount;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const client = clientList.find((item) => "focus" in item);
      if (client) return client.focus();
      if (clients.openWindow) return clients.openWindow("/");
      return undefined;
    })
  );
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    incrementIconBadge().then((count) =>
      self.registration.showNotification("Nouvelle photo dans Recue", {
        body: count > 1
          ? `${count} nouvelles photos attendent dans PhotoCours.`
          : "Une nouvelle photo est arrivee dans PhotoCours.",
        badge: "icons/icon-192.svg",
        icon: "icons/icon-192.svg",
        tag: "photocours-received"
      })
    )
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SET_BADGE") return;
  event.waitUntil(setIconBadge(Number(event.data.count) || 0));
});
