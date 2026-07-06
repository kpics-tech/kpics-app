// K-PICS サービスワーカー（最小構成）
// ホーム画面に追加したときに正しく「アプリ」として認識されるために必要なファイルです。
// 複雑なオフライン機能は持たせず、通常はネットから読み込む形にしています。

const CACHE_NAME = 'kpics-shell-v3';
const SHELL_FILES = [
  './index.html',
  './app.js',
  './assets/logo-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(()=>{})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

// ネットワークが使えるときは常に最新を取得し、オフライン時のみキャッシュを使う
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
