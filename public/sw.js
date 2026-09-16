const clearBadge = () => "clearAppBadge" in self.navigator
  ? self.navigator.clearAppBadge().catch(() => {}) : Promise.resolve();
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_BADGE") event.waitUntil(clearBadge());
});

self.addEventListener("push", (event) => {
  const fallback = {
    title: "Your song is ready",
    body: "Open Mr. Mojo Rising to play it.",
    url: "/",
    tag: "song-ready",
  };

  let payload = fallback;
  try {
    payload = { ...fallback, ...(event.data ? event.data.json() : {}) };
  } catch {
    // A visible fallback is required for every push event.
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: payload.tag,
        data: { url: payload.url },
      }),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
        if (clients.some(client => client.visibilityState === "visible")) return clearBadge();
        return "setAppBadge" in self.navigator ? self.navigator.setAppBadge(1).catch(() => {}) : undefined;
      }),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    clearBadge().then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true })).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
