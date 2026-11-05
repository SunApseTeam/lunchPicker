// Keeps the heavy things that rarely change in this browser: the web fonts, the team's photos and
// the logo. The page's own files are left to the browser's HTTP cache, so a deploy shows at once.
//   fonts.gstatic.com font files never change under one URL: served from the cache once there.
//   everything else here may be replaced under the same URL: served from the cache at once, and
//   fetched again behind it, so a new photo shows from the next visit.
const CACHE = 'lunch-plinko-assets-v1';

const forever = (url) => url.hostname === 'fonts.gstatic.com';
const refreshed = (url) =>
  url.hostname === 'fonts.googleapis.com' ||
  url.hostname === 'i.postimg.cc' ||
  (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/team/'));

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lunch-plinko-assets-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// A photo request is no-cors, so its answer is opaque and its status unreadable: keep it anyway.
// A missing photo kept that way is replaced the next time it is fetched again.
async function fetchInto(cache, request) {
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (forever(url)) {
    e.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(e.request)) ?? fetchInto(cache, e.request)));
  } else if (refreshed(url)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const kept = await cache.match(e.request);
        const fresh = fetchInto(cache, e.request);
        if (!kept) return fresh;
        e.waitUntil(fresh.catch(() => {}));
        return kept;
      }),
    );
  }
});
