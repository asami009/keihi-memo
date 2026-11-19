/* 一度開いたら電波がなくても使えるようにする仕組み。ファイルを直したら VERSION の数字を上げる。
   電波があるときは毎回新しい版がないか確かめ、なければ保存しておいた物を使う。メモの中身はここを通らない */
var VERSION = 'keihi-aikata-v1';
var FILES = ['./', 'index.html', 'style.css', 'js/app.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('keihi-aikata-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // cache: 'no-cache' で、毎回「新しい版がないか」を確かめる（古いファイルが10分残るのを防ぐ）。
  // ページ本体（navigate）は、そのままの形だと古いブラウザで作り直しに失敗するので、URLから作り直す
  var req = e.request.mode === 'navigate' ? new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
    })
  );
});
