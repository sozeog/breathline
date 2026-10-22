// 오프라인 저장: 처음 한 번 열 때 모든 파일을 아이패드에 저장하고, 그 뒤엔 인터넷 없이도 열린다
const CACHE = 'wangnun-goggle-v2';
const FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "apple-touch-icon.png",
  "icon-512.png",
  "assets/battery.png",
  "assets/bg_autoconnect.jpg",
  "assets/bg_connect.jpg",
  "assets/bg_divedata.jpg",
  "assets/bg_surface.jpg",
  "assets/bg_today.jpg",
  "assets/bg_trace.jpg",
  "assets/buddy_tag.png",
  "assets/compass.png",
  "assets/connect.mp4",
  "assets/divedata.mp4",
  "assets/divedata_sound.m4a",
  "assets/fonts/Pretendard-ExtraLight.otf",
  "assets/fonts/Pretendard-Light.otf",
  "assets/fonts/Pretendard-Medium.otf",
  "assets/frame.png",
  "assets/notice.png",
  "assets/panel_buddy.png",
  "assets/panel_me.png",
  "assets/recover_breath.m4a",
  "assets/surface.mp4",
  "assets/surface_recover.png",
  "assets/today_1080.mp4",
  "assets/today_card.png",
  "assets/today_counts.png",
  "assets/today_fill.png",
  "assets/today_head.png",
  "assets/today_track.png",
  "assets/trace.mp4",
  "assets/trace_bracket.png",
  "assets/trace_tag.png",
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 영상은 사파리가 구간(Range)으로 요청하므로, 저장해 둔 파일에서 잘라서 돌려준다
async function rangeResponse(req, res) {
  const buf = await res.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let start = m && m[1] ? +m[1] : 0, end = m && m[2] ? +m[2] : size - 1;
  if (m && !m[1] && m[2]) { start = size - +m[2]; end = size - 1; }
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': res.headers.get('Content-Type') || 'video/mp4', 'Content-Range': `bytes ${start}-${end}/${size}`,
    'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return req.headers.get('range') ? rangeResponse(req, hit) : hit;
    try { return await fetch(req); } catch (err) { return (await caches.match('./', { ignoreSearch: true })) || Response.error(); }
  })());
});
