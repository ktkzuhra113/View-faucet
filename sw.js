/* Keeps the site usable when the local/hosting server is slow or stuck:
   network first, but after 1.5 s (or on error) the last cached copy is used. */
const V = "vf-1";
const FILES = ["./", "index.html", "login.html", "signup.html", "forgot.html", "dashboard.html", "faucet.html", "daily.html", "coupon.html", "referral.html", "withdrawal.html", "profile.html", "style.css", "app.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  const cached = () => caches.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); } return res; });
  const slow = new Promise((r) => setTimeout(() => cached().then(r), 1500));
  e.respondWith(Promise.race([net, slow.then((hit) => hit || net)]).catch(async () => (await cached()) || Response.error()));
});
