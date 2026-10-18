// 単語リングのサービスワーカー：電波がなくても開けるように、ページとアイコン・文字（フォント）を端末にとっておく。
// ページは毎回まずネットから取りに行くので、GitHub に新しい index.html を上げれば、次に開いたときから新しい版になる。
// 単語データ（words.<番号>.js）は中身が変わると名前も変わるので、一度取ったら端末のものを使う（毎回取りに行かない）。
const CACHE = "tango-ring-v3";
const WORDS = "./words.e174d2d7.js"; // tools/build_public.py が書き換える
const CORE = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", WORDS];
const isWords = url => /\/words\.[0-9a-f]+\.js$/.test(url.pathname);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  const now = new URL(WORDS, location.href).href;
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    // 前の単語データは消す
    .then(() => caches.open(CACHE)).then(c => c.keys().then(rs => Promise.all(rs.filter(r => isWords(new URL(r.url)) && r.url !== now).map(r => c.delete(r)))))
    .then(() => self.clients.claim()));
});

const keep = (req, res) => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; };

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 単語データ：とっておいた版を先に使う（名前が同じなら中身も同じ）
  if (url.origin === location.origin && isWords(url)) {
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(res => res.ok ? keep(req, res) : res)));
    return;
  }
  // 同じサイトのもの（ページ・アイコン）：ネットから。つながらないときは、とっておいた版。
  // ブラウザが覚えている古い版（GitHub は10分ほど使い回す）を使わず、毎回新しい版があるか確かめる（no-cache）
  if (url.origin === location.origin) {
    // ページを開く要求（navigate）にはそのまま設定を足せないので、URL から作り直して取りに行く
    e.respondWith(fetch(req.url, { cache: "no-cache", credentials: "same-origin" }).then(res => res.ok ? keep(req, res) : res)
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(m => m || (req.mode === "navigate" ? caches.match("./index.html") : Response.error()))));
    return;
  }
  // フォント（Google Fonts）：とっておいた版を先に使う（めったに変わらないため）
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(res => keep(req, res))));
  }
});
