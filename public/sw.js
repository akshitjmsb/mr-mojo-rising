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
      "setAppBadge" in self.navigator
        ? self.navigator.setAppBadge(1)
        : Promise.resolve(),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
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
