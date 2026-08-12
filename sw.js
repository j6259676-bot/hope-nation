// Hope Nation 家人們 — service worker
//
// 規格：my-agent/100_Todo/projects/hope-nation-perf/SPEC.md
//
// 只快取「外殼」——App 本身的程式碼與資源。
// 後端 API 的回應一律不進這裡的快取。這條界線是硬的：越界就等於偷做
// stale-while-revalidate（先給舊資料），而那在規格階段已經被否決，
// 理由是排班是協調型工具，錯的資料比慢的資料傷害大。

const VERSION = '2026-08-12·da1a9f';
const SHELL_CACHE = 'hn-shell-' + VERSION;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // cache: 'reload' 讓預快取繞過瀏覽器的 HTTP 快取。
      // GitHub Pages 送的是 max-age=600，不繞過的話新版 service worker
      // 可能把一份「十分鐘前的舊 index.html」存成新版快取——版本號變了、
      // 內容卻是舊的，那種 bug 幾乎查不出來。
      .then((cache) =>
        cache.addAll(
          SHELL_ASSETS.map((u) => new Request(u, { cache: 'reload' }))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith('hn-shell-') && n !== SHELL_CACHE)
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

// 頁面要求立即接手（更新流程用）。
// 不依賴 controllerchange 事件 —— iOS 加到主畫面的 PWA 常常不觸發它，
// 那正是「按了更新沒反應」的根因。頁面那邊會自己重載。
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // 跨網域一律不攔截 —— 後端 API（script.google.com）與 Google Fonts
  // 都走瀏覽器原本的路。API 回應不進快取的規則就落在這一行。
  if (url.origin !== self.location.origin) return;

  // 版本檔永遠走網路。它是所有遠端指令（含自我移除）的通道，
  // 一旦被快取住，我們就失去對裝置下指令的能力 —— service worker
  // 最危險的失敗模式就是把自己鎖死。
  if (url.pathname.endsWith('/version.json')) return;

  // 開啟 App 這一下：直接給快取裡的外殼，不等網路。這就是「秒開」的來源。
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((hit) => hit || fetch(req))
    );
    return;
  }

  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
