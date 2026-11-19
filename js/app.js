/* 経費メモ（仮）— 画面の動き
   データ（メモ・写真）はこのスマホのブラウザの中だけに保存する。外のサーバーには何も送らない。
   経費になるかどうかの判断・税金の計算はしない（最後の判断は人）。 */
(function () {
  'use strict';

  var APP_NAME = '経費メモ（仮）';
  var VERSION_LABEL = '試作 0.1';
  var KEY = 'keihi-aikata-v1';
  var DAY = 86400000;
  var WD = '日月火水木金土';

  /* 分類：ふだんの言葉で選ぶ。勘定科目（kamoku）は表に書き出すときだけ「めやす」として使う */
  var CATS = [
    { id: 'move', icon: '🚃', label: '移動', detail: '電車・バス・タクシー・コインパーキング・ガソリン', kamoku: '旅費交通費' },
    { id: 'tool', icon: '✏️', label: '道具・文房具', detail: '文房具・日用品・パソコンまわりの物など。1つ10万円以上の物は「迷ってる」にしておくと安心です', kamoku: '消耗品費' },
    { id: 'phone', icon: '📱', label: 'スマホ・ネット', detail: '携帯代・Wi-Fi・切手・はがき', kamoku: '通信費' },
    { id: 'soft', icon: '💻', label: 'ソフト・サブスク', detail: 'アプリやサービスの月額・年額', kamoku: '通信費' },
    { id: 'ship', icon: '📦', label: '送料・梱包', detail: '発送・宅配便・段ボール（切手は「スマホ・ネット」へ）', kamoku: '荷造運賃' },
    { id: 'meet', icon: '☕', label: '打ち合わせ', detail: '打ち合わせのお茶・軽食', kamoku: '会議費' },
    { id: 'treat', icon: '🎁', label: 'おつきあい', detail: '取引先との食事・お祝い・手みやげ', kamoku: '接待交際費' },
    { id: 'study', icon: '📚', label: '本・勉強', detail: '本・資料・講座・セミナー', kamoku: '新聞図書費' },
    { id: 'ad', icon: '📣', label: '宣伝', detail: 'チラシ・広告・ホームページ', kamoku: '広告宣伝費' },
    { id: 'outsource', icon: '🤝', label: '人に頼んだ', detail: '外注・業務委託', kamoku: '外注工賃' },
    { id: 'rent', icon: '🏠', label: '家賃・場所代', detail: '事務所・レンタルスペース・月極駐車場', kamoku: '地代家賃' },
    { id: 'util', icon: '💡', label: '電気・ガス・水道', detail: '仕事場の電気・ガス・水道', kamoku: '水道光熱費' },
    { id: 'fee', icon: '🏦', label: '手数料', detail: '振込手数料・決済の手数料など', kamoku: '支払手数料' },
    { id: 'other', icon: '🧾', label: 'その他', detail: 'どれにも入らない物', kamoku: '雑費' },
    { id: 'unknown', icon: '🤔', label: 'わからない', detail: '分類はあとで決めます。自動で「迷ってる」に入ります', kamoku: '' }
  ];
  var CAT = {};
  CATS.forEach(function (c) { CAT[c.id] = c; });

  var ICON_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  var ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>';
  var ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>';

  /* ---------- 保存（localStorage：メモ／IndexedDB：写真） ---------- */
  function blank() { return { v: 1, entries: [], settings: {} }; }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      var d = JSON.parse(raw);
      if (!d || !Array.isArray(d.entries)) return blank();
      d.settings = d.settings || {};
      return d;
    } catch (e) { return blank(); }
  }
  var S = load();
  var askedPersist = false;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {
      toast('保存できませんでした。スマホの空き容量やブラウザの設定を確かめてください');
      return false;
    }
    // ブラウザに「このデータは消さないで」と頼む（効くかはブラウザ次第）
    if (!askedPersist && navigator.storage && navigator.storage.persist) {
      askedPersist = true;
      navigator.storage.persist().catch(function () {});
    }
    return true;
  }

  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no idb')); return; }
      var r = indexedDB.open('keihi-aikata', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('photos'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('photos', mode);
        var out = fn(t.objectStore('photos'));
        t.oncomplete = function () { res(out && 'result' in out ? out.result : undefined); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }
  function photoPut(id, data) { return tx('readwrite', function (s) { s.put(data, id); }); }
  function photoGet(id) { return tx('readonly', function (s) { return s.get(id); }); }
  function photoDel(id) { return tx('readwrite', function (s) { s.delete(id); }); }

  /* ---------- 小道具 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { return ymd(new Date()); }
  function yesterdayStr() { var d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); }
  function parseD(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function md(s) { var d = parseD(s); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function mdw(s) { var d = parseD(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD[d.getDay()] + '）'; }
  function yen(n) { return '¥' + Number(n || 0).toLocaleString('ja-JP'); }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function catOf(e) { return CAT[e.cat] || CAT.other; }
  function isMobile() { return window.matchMedia && window.matchMedia('(pointer: coarse)').matches; }
  function isStandalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isIOSChrome() { return /CriOS/.test(navigator.userAgent); }
  // LINEなどアプリの中のブラウザ（ホーム画面に追加できない）
  function isInApp() { return /Line\/|FBAN|FBAV|Instagram/.test(navigator.userAgent); }
  function parseAmount(v) {
    var s = String(v || '').replace(/[０-９．]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    s = s.split('.')[0].replace(/[^0-9]/g, '');  // 小数点より後ろは読まない（円は整数）
    if (!s) return 0;
    return Math.min(parseInt(s, 10), 999999999);
  }

  function counted(e) { return !e.excluded; }
  function sumOf(list) { return list.reduce(function (a, e) { return a + (e.excluded ? 0 : e.amount); }, 0); }
  function inMonth(e, y, m) { return e.date.slice(0, 7) === y + '-' + pad(m); }
  function inYear(e, y) { return e.date.slice(0, 4) === String(y); }
  function byDateDesc(a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.created - a.created); }
  function byDateAsc(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.created - b.created); }
  function doubts() { return S.entries.filter(function (e) { return e.doubt; }); }
  function findE(id) { for (var i = 0; i < S.entries.length; i++) if (S.entries[i].id === id) return S.entries[i]; return null; }

  /* ---------- 確定申告のしめきり（例年3月15日。土日なら次の月曜） ---------- */
  function shiftWeekend(y, m, d) {
    var dt = new Date(Date.UTC(y, m - 1, d));
    var w = dt.getUTCDay();
    if (w === 6) dt.setUTCDate(dt.getUTCDate() + 2);
    else if (w === 0) dt.setUTCDate(dt.getUTCDate() + 1);
    return dt;
  }
  function deadlineInfo(now) {
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    var y = now.getFullYear();
    var end = shiftWeekend(y, 3, 15);
    if (today > end.getTime()) { y += 1; end = shiftWeekend(y, 3, 15); }
    var start = shiftWeekend(y, 2, 16);
    return {
      taxYear: y - 1, end: end, start: start,
      days: Math.round((end.getTime() - today) / DAY),
      open: today >= start.getTime(),
      afterYearEnd: now.getFullYear() === y   // 1月〜しめきり：去年の分をまとめる時期
    };
  }
  function utcLabel(dt, withYear) {
    return (withYear ? dt.getUTCFullYear() + '年' : '') + (dt.getUTCMonth() + 1) + '月' + dt.getUTCDate() + '日（' + WD[dt.getUTCDay()] + '）';
  }

  /* ---------- 画面の状態 ---------- */
  var now0 = new Date();
  var V = { tab: 'home', sumMode: 'month', y: now0.getFullYear(), m: now0.getMonth() + 1, justId: null };

  /* ---------- 描く ---------- */
  function render(keepScroll) {
    var app = $('#app');
    var nav = $('#nav'), fab = $('#fab');
    if (!S.settings.introDone) {
      app.innerHTML = introHTML(false);
      nav.classList.add('hidden'); fab.classList.add('hidden');
      return;
    }
    nav.classList.remove('hidden');
    var html = V.tab === 'doubt' ? doubtHTML() : V.tab === 'summary' ? summaryHTML() : V.tab === 'settings' ? settingsHTML() : homeHTML();
    app.innerHTML = html;
    Array.prototype.forEach.call(nav.querySelectorAll('button'), function (b) { b.classList.toggle('on', b.dataset.tab === V.tab); });
    var n = doubts().length, badge = $('#badge');
    badge.textContent = n; badge.classList.toggle('hidden', !n);
    var showFab = V.tab === 'doubt' || V.tab === 'summary';
    fab.classList.toggle('hidden', !showFab);
    document.body.classList.toggle('has-fab', showFab);
    if (!keepScroll) window.scrollTo(0, 0);
    V.justId = null;
  }

  function headHTML(title, right) {
    return '<header class="top wrap"><h1>' + h(title) + '</h1>' + (right ? '<p class="today">' + right + '</p>' : '') + '</header>';
  }

  function introHTML(asSheet) {
    var s = '<div class="wrap' + (asSheet ? '' : ' intro') + '">' +
      (asSheet ? '' : '<h1>' + h(APP_NAME) + '</h1>') +
      '<p class="lead">使ったお金を、その場で10秒メモ。<br>「これ経費？」と迷ったものは、税理士さんなどに聞くときのリストになります。</p>' +
      (asSheet ? '' : iosFirstHTML()) +
      '<ol class="steps">' +
      '<li><span class="no">1</span><div><b>使ったら、すぐメモ</b><p>金額を入れて、分類を選ぶだけ。レシートの写真は撮っても撮らなくてもOKです。</p></div></li>' +
      '<li class="f"><span class="no">2</span><div><b>迷ったら「迷ってる」</b><p>押しておくと「迷いリスト」にたまります。税理士さんや詳しい人に聞くときに、まとめて送れます。</p></div></li>' +
      '<li><span class="no">3</span><div><b>月末に、まとめを見る</b><p>月ごとの合計がわかります。Excelで開ける表にして、税理士さんに渡せます。</p></div></li>' +
      '</ol>' +
      '<div class="promise">' +
      '<p><b>メモはこのスマホの中だけ</b>に保存されます。どこにも送られません。</p>' +
      '<p>そのかわり、機種変更やブラウザのデータ削除で消えます。ときどき「せってい」から<b>控えを保存</b>してください。</p>' +
      '<p>このアプリは、経費になるかどうかの判断や税金の計算はしません。最後は税理士さんや税務署に確かめてください。</p>' +
      '</div>' +
      (asSheet ? '' : '<button class="btn primary big" data-act="start">はじめる</button><p class="ver">' + h(VERSION_LABEL) + '</p>') +
      '</div>';
    return s;
  }

  function deadlineHTML(now) {
    var dl = deadlineInfo(now);
    var main;
    if (dl.days === 0) main = '<p class="main">きょうが、しめきり日です</p>';
    else main = '<p class="main">' + (dl.open ? '申告期間中。しめきりまで' : 'しめきりまで') + ' あと<span class="days num">' + dl.days + '</span>日</p>';
    var s = '<section class="deadline' + (dl.open ? ' open' : '') + '" aria-label="確定申告のしめきり">' +
      '<p class="for">' + dl.taxYear + '年分（1〜12月）の確定申告</p>' + main +
      '<p class="when">' + utcLabel(dl.end, true) + 'まで' + (dl.open ? '' : '（申告は' + utcLabel(dl.start) + 'から）') + '</p>';
    if (dl.afterYearEnd) s += '<button class="btn small" data-act="yearsheet" data-y="' + dl.taxYear + '">' + dl.taxYear + '年分のまとめを見る</button>';
    return s + '</section>';
  }

  /* iPhoneは、ブラウザで開いたページと、ホーム画面のアイコンから開いたアプリで保存場所が別になる。
     だから「先にホーム画面に追加して、そこから使う」を、メモが0件のうちに一番上で伝える */
  function iosSeparateText() {
    var b = isIOSChrome() ? 'Chrome' : 'Safari';
    return 'iPhoneでは、' + b + 'で開いたこのページと、ホーム画面のアイコンから開いたアプリで、メモの保存場所が別になります。' +
      (isIOSChrome() ? '' : 'Safariのまま使うと、7日ほど開かない日が続いたときにメモが消えることもあります。');
  }
  function iosFirstHTML() {
    if (!isIOS() || isStandalone() || isInApp()) return '';
    return '<div class="notice first"><b>iPhoneの人は、先にホーム画面に追加してください</b>' + iosSeparateText() + howToIOS() +
      '<p>追加したら、ホーム画面のアイコンから開いて「はじめる」を押してください。</p></div>';
  }
  function a2hsHTML() {
    if (isStandalone() || !isMobile() || S.settings.hideA2HS || isInApp()) return '';
    if (isIOS()) {
      var has = S.entries.length > 0;
      return '<div class="notice' + (has ? '' : ' first') + '"><b>' + (has ? 'ホーム画面に追加して使うのがおすすめです' : 'iPhoneの人は、先にホーム画面に追加してください') + '</b>' + iosSeparateText() +
        (has ? 'いまのメモをアイコンの方へ移すときは、先に「せってい」→「控えを保存する」をしてから、アイコンから開いた方で「控えから戻す」を押してください。'
          : '追加したら、ホーム画面のアイコンから開いてメモしてください。') +
        '<details><summary>追加のしかた</summary>' + howToIOS() + '</details>' +
        '<div class="row"><button class="btn small" data-act="hideA2HS">' + (has ? '閉じる' : 'このまま使う') + '</button></div></div>';
    }
    return '<div class="notice"><b>ホーム画面に置くと、すぐ開けます</b>アプリのように、ホーム画面のアイコンから開けるようになります。ブラウザのデータを消すとメモも消えるので、ときどき控えを保存してください。' +
      '<details><summary>追加のしかた</summary>' + howToAndroid() + '</details>' +
      '<div class="row"><button class="btn small" data-act="hideA2HS">閉じる</button></div></div>';
  }
  function howToIOS() {
    if (isIOSChrome()) return '<ol><li>画面の上の、アドレスの右にある「共有」ボタン（□に↑のマーク）を押す</li><li>出てきた一覧を少し上にずらして「ホーム画面に追加」を押す</li><li>右上の「追加」を押す</li><li>ホーム画面に出たアイコンから開く</li></ol>';
    return '<ol><li>画面の下の「共有」ボタン（□に↑のマーク）を押す。見当たらないときは、右下の「…」を押してから「共有」を押す</li>' +
      '<li>出てきた一覧を少し上にずらして「ホーム画面に追加」を押す</li><li>「Webアプリとして開く」が出たら、オンのまま右上の「追加」を押す</li><li>ホーム画面に出たアイコンから開く</li></ol>';
  }
  function howToAndroid() { return '<ol><li>右上の「︙」を押す</li><li>「ホーム画面に追加」または「アプリをインストール」を押す</li><li>ホーム画面に出たアイコンから開く</li></ol>'; }

  function backupNudgeHTML() {
    var n = S.entries.length;
    if (n < 10) return '';
    var last = S.settings.lastBackup || 0, snooze = S.settings.snoozeBackup || 0;
    if (Date.now() < snooze) return '';
    if (last && Date.now() - last < 14 * DAY) return '';
    return '<div class="notice"><b>' + (last ? '前回の控えから' + Math.floor((Date.now() - last) / DAY) + '日たちました' : 'まだ控えを保存していません') + '</b>' +
      'メモが' + n + '件になりました。機種変更などで消えたときのために、控えを保存しておくと安心です。' +
      '<div class="row"><button class="btn small primary" data-act="backup">控えを保存する</button><button class="btn small ghost" data-act="snoozeBackup">あとで</button></div></div>';
  }

  function rowHTML(e) {
    var c = catOf(e);
    return '<button class="erow' + (e.doubt ? ' doubt' : '') + (e.excluded ? ' out' : '') + (V.justId === e.id ? ' just' : '') + '" data-act="edit" data-id="' + h(e.id) + '"' +
      ' aria-label="' + h(mdw(e.date) + ' ' + c.label + ' ' + e.amount + '円' + (e.doubt ? ' 迷い中' : '') + (e.excluded ? ' 経費から外した' : '')) + '">' +
      '<span class="d">' + md(e.date) + '</span>' +
      '<span class="ic" aria-hidden="true">' + c.icon + '</span>' +
      '<span class="t"><span class="cl">' + h(c.label) + (e.hasPhoto ? ICON_CAM : '') + '</span>' + (e.note ? '<span class="nt">' + h(e.note) + '</span>' : '') + '</span>' +
      '<span class="a">' + yen(e.amount) + '</span></button>';
  }

  function homeHTML() {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth() + 1;
    var month = S.entries.filter(function (e) { return inMonth(e, y, m) && counted(e); });
    var nd = doubts().length;
    var recent = S.entries.slice().sort(function (a, b) { return b.created - a.created; }).slice(0, 8);
    var s = headHTML(APP_NAME, mdw(todayStr())) + '<main class="wrap">';
    s += deadlineHTML(now);
    // iPhoneでメモが0件のうちは、ホーム画面に追加する案内をボタンより上に出す（あとで入れるとメモが別の場所に分かれるため）
    var a2 = a2hsHTML();
    var a2top = a2 && isIOS() && !S.entries.length;
    if (a2top) s += a2;
    s += '<button class="btn primary big" data-act="new">＋ 経費をメモする</button>';
    s += '<div class="month-line"><div><span class="lbl">' + m + '月のメモ</span><b class="num">' + month.length + '件</b><b class="num">' + yen(sumOf(month)) + '</b></div>' +
      (nd ? '<button class="doubt-chip" data-act="tab" data-tab="doubt">迷い ' + nd + '件</button>' : '') + '</div>';
    var notices = (a2top ? '' : a2) || backupNudgeHTML();  // お知らせは1度に1つだけ
    if (notices) s += '<div class="notices">' + notices + '</div>';
    s += '<h2 class="sec">さいきん入れたメモ</h2>';
    if (recent.length) {
      s += '<div class="ledger">' + recent.map(rowHTML).join('') + '</div>';
      if (S.entries.length > recent.length) s += '<button class="link" data-act="tab" data-tab="summary">月ごとに見る（まとめ）</button>';
    } else {
      s += '<div class="empty"><b>まだメモがありません</b>お金を使ったら、すぐ「＋ 経費をメモする」を押してください。金額と分類だけで、10秒で終わります。</div>';
    }
    return s + '</main>';
  }

  function doubtHTML() {
    var list = doubts().sort(byDateDesc);
    var done = S.entries.filter(function (e) { return e.resolved && !e.doubt; }).sort(byDateDesc);
    var s = headHTML('迷いリスト') + '<main class="wrap"><p class="lead">「これ経費？」と迷ったもの。まとめて税理士さんや詳しい人に聞けます。</p>';
    if (list.length) {
      s += '<div class="notes">' + list.map(function (e) {
        var c = catOf(e);
        return '<article class="note">' +
          '<div class="top-line"><span>' + mdw(e.date) + '</span><b class="num">' + yen(e.amount) + '</b></div>' +
          '<p class="what">' + c.icon + ' ' + h(c.label) + (e.note ? '　<span>' + h(e.note) + '</span>' : '') + '</p>' +
          (e.doubtNote ? '<p class="q">迷っていること：' + h(e.doubtNote) + '</p>' : '<p class="q none">何に迷っているかを書いておくと、聞くときに楽です（「直す」から書けます）</p>') +
          '<div class="row"><button class="btn small solid" data-act="resolve" data-id="' + h(e.id) + '">答えが出た</button><button class="btn small" data-act="edit" data-id="' + h(e.id) + '">直す</button></div>' +
          '</article>';
      }).join('') + '</div>';
      s += '<div class="export"><button class="btn primary wide" data-act="shareDoubts">迷いリストを送る・コピーする</button>' +
        '<p class="muted">LINEやメールに貼れる文になります。金額・日付・ひとこと・迷っていることが入ります（写真は入りません）。</p></div>';
    } else {
      s += '<div class="empty"><b>いま迷っているものはありません</b>メモするときに「これ経費？ 迷ってる」を押すと、ここにたまります。</div>';
    }
    if (done.length) {
      s += '<details class="done"><summary>答えが出たもの（' + done.length + '件）</summary><div class="ledger">' +
        done.map(function (e) { return rowHTML(e) + (e.answer ? '<p class="answer">答え：' + h(e.answer) + '</p>' : ''); }).join('') +
        '</div></details>';
    }
    return s + '</main>';
  }

  function barsHTML(list) {
    var by = {};
    list.forEach(function (e) { if (!e.excluded) by[e.cat] = (by[e.cat] || 0) + e.amount; });
    var rows = Object.keys(by).map(function (k) { return { c: CAT[k] || CAT.other, a: by[k] }; }).sort(function (a, b) { return b.a - a.a; });
    if (!rows.length) return '';
    var max = rows[0].a || 1;
    return '<div class="bars">' + rows.map(function (r) {
      return '<div class="bar"><span class="ic" aria-hidden="true">' + r.c.icon + '</span><span class="lbl">' + h(r.c.label) +
        '<span class="track"><span class="fill" style="width:' + Math.max(2, Math.round(r.a / max * 100)) + '%"></span></span></span><span class="a">' + yen(r.a) + '</span></div>';
    }).join('') + '</div>';
  }

  function summaryHTML() {
    var now = new Date(), cy = now.getFullYear(), cm = now.getMonth() + 1;
    var s = headHTML('まとめ') + '<main class="wrap">' +
      '<div class="seg" role="tablist"><button role="tab" aria-selected="' + (V.sumMode === 'month') + '" class="' + (V.sumMode === 'month' ? 'on' : '') + '" data-act="sumMode" data-mode="month">月ごと</button>' +
      '<button role="tab" aria-selected="' + (V.sumMode === 'year') + '" class="' + (V.sumMode === 'year' ? 'on' : '') + '" data-act="sumMode" data-mode="year">1年（1〜12月）</button></div>';
    if (V.sumMode === 'month') {
      var list = S.entries.filter(function (e) { return inMonth(e, V.y, V.m); });
      var cnt = list.filter(counted);
      var dl = list.filter(function (e) { return e.doubt && counted(e); });
      var nd = dl.length;
      var atNow = V.y > cy || (V.y === cy && V.m >= cm);
      s += '<div class="pager"><button data-act="prevM" aria-label="前の月">' + ICON_PREV + '</button><h2>' + V.y + '年' + V.m + '月</h2><button data-act="nextM" aria-label="次の月"' + (atNow ? ' disabled' : '') + '>' + ICON_NEXT + '</button></div>';
      s += '<div class="total"><span>合計</span><span class="big num">' + yen(sumOf(cnt)) + '</span><span class="muted">' + cnt.length + '件' + (nd ? '（うち迷い中 ' + nd + '件・' + yen(sumOf(dl)) + '）' : '') + '</span></div>';
      if (!list.length) {
        s += '<div class="empty" style="margin-top:14px"><b>この月のメモはありません</b>左右のボタンで月を切りかえられます。</div>';
      } else {
        s += barsHTML(list);
        s += exportHTML('month', cnt.length);
        s += '<h2 class="sec">この月のメモ</h2><div class="ledger">' + list.slice().sort(byDateDesc).map(rowHTML).join('') + '</div>';
      }
    } else {
      var ylist = S.entries.filter(function (e) { return inYear(e, V.y); });
      var ycnt = ylist.filter(counted);
      s += '<div class="pager"><button data-act="prevY" aria-label="前の年">' + ICON_PREV + '</button><h2>' + V.y + '年</h2><button data-act="nextY" aria-label="次の年"' + (V.y >= cy ? ' disabled' : '') + '>' + ICON_NEXT + '</button></div>';
      s += '<div class="total"><span>1年の合計</span><span class="big num">' + yen(sumOf(ycnt)) + '</span><span class="muted">' + ycnt.length + '件（' + V.y + '年1月1日〜12月31日の日付のメモ）' +
        (function () { var yd = ycnt.filter(function (e) { return e.doubt; }); return yd.length ? '・うち迷い中 ' + yd.length + '件・' + yen(sumOf(yd)) : ''; })() + '</span></div>';
      s += '<div class="months">';
      for (var m = 1; m <= 12; m++) {
        var ml = ycnt.filter(function (e) { return inMonth(e, V.y, m); });
        var a = sumOf(ml);
        s += '<button class="' + (ml.length ? '' : 'zero') + '" data-act="goMonth" data-m="' + m + '"><span>' + m + '月　<span class="muted">' + ml.length + '件</span></span><span class="a">' + yen(a) + '</span></button>';
      }
      s += '</div>';
      if (ylist.length) { s += barsHTML(ylist); s += exportHTML('year', ycnt.length); }
    }
    return s + '</main>';
  }

  function exportHTML(mode, n) {
    var label = mode === 'month' ? V.y + '年' + V.m + '月の表を保存' : V.y + '年の表を保存';
    return '<div class="export"><button class="btn primary wide" data-act="csv" data-mode="' + mode + '"' + (n ? '' : ' disabled') + '>' + label + '</button>' +
      '<p class="muted">税理士さんに渡す用の表です。Excel・Numbers・Googleスプレッドシートで開けます。「経費から外した」メモは入りません。写真は入らないので、レシートの紙はとっておいてください。</p></div>';
  }

  function settingsHTML() {
    var n = S.entries.length;
    var nd = doubts().length;
    var nr = S.entries.filter(function (e) { return e.resolved; }).length;
    var oldest = n ? S.entries.slice().sort(byDateAsc)[0].date : null;
    var last = S.settings.lastBackup;
    var s = headHTML('せってい') + '<main class="wrap">';
    s += '<section class="panel"><h2>これまでの記録</h2><div class="stats">' +
      '<div><b>' + n + '</b><span>メモ</span></div><div><b>' + nd + '</b><span>迷い中</span></div><div><b>' + nr + '</b><span>答えが出た</span></div></div>' +
      (oldest ? '<p class="muted">いちばん古いメモ：' + parseD(oldest).getFullYear() + '年' + mdw(oldest) + '</p>' : '') + '</section>';
    s += '<section class="panel"><h2>控え（バックアップ）</h2>' +
      '<p>メモはこのスマホの中だけにあります。機種変更の前や、月に1回くらい、控えを保存しておくと安心です。写真も一緒に入ります。</p>' +
      '<p class="muted">' + (last ? '前回の控え：' + new Date(last).getFullYear() + '年' + mdw(ymd(new Date(last))) : 'まだ控えを保存していません') + '</p>' +
      '<div class="row"><button class="btn primary" data-act="backup"' + (n ? '' : ' disabled') + '>控えを保存する</button>' +
      '<label class="btn" for="restore-file">控えから戻す</label><input id="restore-file" type="file" accept=".json,application/json" class="hidden"></div>' +
      '<p class="muted">「控えから戻す」は、いまのメモを消さずに、控えにだけあるメモを足します。</p></section>';
    s += '<section class="panel"><h2>ホーム画面に置く</h2>' +
      (isStandalone() ? '<p>いまはホーム画面から開いています。このままでOKです。</p>'
        : '<p>ホーム画面に置くと、アプリのようにアイコンから開けます。</p>' +
          (isIOS() ? '<p>' + iosSeparateText() + 'すでにメモがあるときは、先に「控えを保存する」をしてから、アイコンから開いた方で「控えから戻す」を押してください。</p>' + howToIOS()
            : '<p><b>Android</b></p>' + howToAndroid() + '<p><b>iPhone</b></p><p>iPhoneでは、ブラウザで開いたページとホーム画面のアイコンから開いたアプリで、メモの保存場所が別になります。先にホーム画面に追加して、アイコンから開いて使ってください。</p>' + howToIOS())) + '</section>';
    s += '<section class="panel"><h2>このアプリについて</h2><ul>' +
      '<li>経費のメモ帳です。経費になるかどうかの判断や、税金の計算・申告書づくりはしません。迷ったものは、税理士さんや税務署に確かめてください。</li>' +
      '<li>表に出る「勘定科目（めやす）」は、選んだ分類から機械的に入れた目安です。正しい科目は税理士さんと決めてください。</li>' +
      '<li>写真はメモ用の控えです。レシートや領収書の紙は、捨てずにとっておいてください。</li>' +
      '<li>しめきり日は「例年3月15日・土日なら次の月曜」で計算しています。その年の日付は国税庁のお知らせで確かめてください。</li>' +
      '<li>メモと写真は、このスマホのブラウザの中だけに保存されます。作った側にも届きません。</li>' +
      '</ul><button class="btn" data-act="showIntro">つかいかたを見る</button></section>';
    s += '<section class="panel"><h2>メモをぜんぶ消す</h2><p>試しに入れたメモを消して、まっさらから始めたいとき用です。消したメモは戻せません。</p>' +
      '<button class="btn danger" data-act="wipe"' + (n ? '' : ' disabled') + '>ぜんぶ消す</button></section>';
    s += '<p class="ver">' + h(APP_NAME) + '　' + h(VERSION_LABEL) + '</p>';
    return s + '</main>';
  }

  /* ---------- 下から出る画面 ---------- */
  var sheetOpen = false;
  // 入力中や「元に戻す」が出ている間に新しい版が届いたら、すぐには読み込み直さず、アプリから離れたときに読み込み直す
  var pendingReload = false;
  var undoShowing = false;
  document.addEventListener('visibilitychange', function () {
    if (pendingReload && document.visibilityState === 'hidden') { pendingReload = false; location.reload(); }
  });
  function openSheet(html, onMount) {
    var layer = $('#layer');
    layer.innerHTML = html;
    document.body.style.overflow = 'hidden';
    if (!sheetOpen) { try { history.pushState({ sheet: 1 }, ''); } catch (e) {} }
    sheetOpen = true;
    if (onMount) onMount(layer.firstElementChild);
  }
  function closeSheet(fromPop) {
    if (!sheetOpen) return;
    sheetOpen = false;
    $('#layer').innerHTML = '';
    document.body.style.overflow = '';
    F = null;
    if (!fromPop && history.state && history.state.sheet) { try { history.back(); } catch (e) {} }
  }
  window.addEventListener('popstate', function () { if (sheetOpen) closeSheet(true); });

  function sheetHTML(title, body, foot) {
    return '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + h(title) + '">' +
      '<div class="sheet-head"><button class="x" data-act="close">とじる</button><h2>' + h(title) + '</h2><span class="spacer"></span></div>' +
      '<div class="sheet-body">' + body + '</div>' + (foot ? '<div class="sheet-foot">' + foot + '</div>' : '') + '</div>';
  }

  /* ---------- メモを入れる・直す ---------- */
  var F = null; // 入力中のメモ

  function openForm(id) {
    var e = id ? findE(id) : null;
    F = e ? {
      id: e.id, amount: e.amount, cat: e.cat, date: e.date, note: e.note || '', doubt: !!e.doubt, doubtNote: e.doubtNote || '',
      resolved: !!e.resolved, answer: e.answer || '', excluded: !!e.excluded, hasPhoto: !!e.hasPhoto, photo: undefined
    } : { id: null, amount: 0, cat: null, date: todayStr(), note: '', doubt: false, doubtNote: '', resolved: false, answer: '', excluded: false, hasPhoto: false, photo: undefined };
    openSheet(sheetHTML(e ? 'メモを直す' : '経費をメモ', formBody(), '<p class="err hidden" id="f-err"></p><button class="btn primary big" data-act="saveForm">' + (e ? '直したメモを保存' : 'メモする') + '</button>'), function () {
      var amt = $('#f-amt');
      amt.value = F.amount ? F.amount.toLocaleString('ja-JP') : '';
      if (!e) amt.focus();
      updateWhen(); updateDoubt(); updateCat();
      if (F.hasPhoto) photoGet(F.id).then(function (d) { if (d && F && F.photo === undefined) showThumb(d); }).catch(function () {});
    });
  }

  function formBody() {
    // 並び：金額 → 分類 → 迷ってる（3本柱が1画面に収まるように）→ 日付・ひとこと・写真
    var s = '<label class="f-label" for="f-amt">払った金額（税込）</label>' +
      '<div class="amount"><span>¥</span><input id="f-amt" type="text" inputmode="numeric" autocomplete="off" placeholder="0"></div>' +
      '<p class="f-label" id="cat-lbl">分類</p><div class="cats" role="radiogroup" aria-labelledby="cat-lbl">' +
      CATS.map(function (c) {
        return '<button type="button" class="cat" role="radio" aria-checked="false" data-act="cat" data-cat="' + c.id + '"><span class="ic" aria-hidden="true">' + c.icon + '</span><span>' + h(c.label).replace(/・/g, '・<wbr>') + '</span></button>';
      }).join('') + '</div><p class="catdetail" id="f-catdetail"></p>' +
      '<button type="button" class="fusen-btn" id="f-doubt" data-act="doubt" aria-pressed="false"><span class="box">' + ICON_CHECK + '</span><span><b>これ経費？ 迷ってる</b><small>押すと「迷いリスト」に入ります。あとでまとめて聞けます</small></span></button>' +
      '<div class="fusen-q hidden" id="f-dq"><label class="f-label" for="f-dnote">何に迷ってる？（なくてもOK）</label><textarea class="text" id="f-dnote" maxlength="300" placeholder="例：家でも使うパソコンだけど、全額入れていい？">' + h(F.doubtNote) + '</textarea></div>' +
      '<p class="f-label f-gap">日付</p><div class="when"><button type="button" class="chip" data-act="when" data-when="today">きょう</button><button type="button" class="chip" data-act="when" data-when="yesterday">きのう</button>' +
      '<input type="date" id="f-date" aria-label="日付を選ぶ" max="' + todayStr() + '" value="' + h(F.date) + '"></div>' +
      '<label class="f-label" for="f-note">ひとこと（なくてもOK）</label><input class="text" id="f-note" type="text" maxlength="80" placeholder="例：〇〇さんと打ち合わせ／コピー用紙" value="' + h(F.note) + '">' +
      '<p class="f-label">レシートの写真（なくてもOK）</p><div class="photo" id="f-photo"><label class="btn small" for="f-file">' + ICON_CAM + '<span id="f-photo-lbl">撮る・選ぶ</span></label><input id="f-file" type="file" accept="image/*"></div>' +
      '<p class="photo-note">写真はメモ用の控えです。レシートの紙はとっておいてください。</p>';
    if (F.resolved) {
      s += '<label class="f-label" for="f-answer">聞いた答え</label><textarea class="text" id="f-answer" maxlength="300">' + h(F.answer) + '</textarea>';
    }
    if (F.excluded) {
      s += '<div class="out-box">このメモは「経費から外した」ものです。合計や表には入りません。<div class="row"><button type="button" class="btn small" data-act="unexclude">経費にもどす</button></div></div>';
    }
    if (F.id) s += '<div class="del"><button type="button" class="btn danger wide" data-act="deleteE">このメモを消す</button></div>';
    return s;
  }

  function updateCat() {
    var layer = $('#layer');
    Array.prototype.forEach.call(layer.querySelectorAll('.cat'), function (b) {
      var on = b.dataset.cat === F.cat;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
    });
    var d = $('#f-catdetail');
    if (d) d.innerHTML = F.cat ? '<b>' + h(CAT[F.cat].label) + '</b>：' + h(CAT[F.cat].detail) : '';
  }
  function updateWhen() {
    var t = todayStr(), y = yesterdayStr();
    Array.prototype.forEach.call($('#layer').querySelectorAll('[data-act="when"]'), function (b) {
      b.classList.toggle('on', (b.dataset.when === 'today' && F.date === t) || (b.dataset.when === 'yesterday' && F.date === y));
    });
    var di = $('#f-date'); if (di && di.value !== F.date) di.value = F.date;
  }
  function updateDoubt() {
    var b = $('#f-doubt'); if (!b) return;
    b.classList.toggle('on', F.doubt); b.setAttribute('aria-pressed', F.doubt);
    $('#f-dq').classList.toggle('hidden', !F.doubt);
  }
  function showThumb(dataUrl) {
    var box = $('#f-photo'); if (!box) return;
    var old = box.querySelector('.thumb'); if (old) old.remove();
    if (dataUrl) {
      box.insertAdjacentHTML('afterbegin', '<span class="thumb row"><button type="button" data-act="viewPhoto" aria-label="写真を大きく見る"><img alt="レシートの写真" src="' + h(dataUrl) + '"></button><button type="button" class="btn small ghost" data-act="removePhoto">写真を外す</button></span>');
      $('#f-photo-lbl').textContent = '撮り直す';
    } else {
      $('#f-photo-lbl').textContent = '撮る・選ぶ';
    }
  }

  function compressImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var max = 1400, w = img.naturalWidth, hh = img.naturalHeight, r = Math.min(1, max / Math.max(w, hh));
        var c = document.createElement('canvas');
        c.width = Math.round(w * r); c.height = Math.round(hh * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('image')); };
      img.src = url;
    });
  }

  function formError(msg) {
    var p = $('#f-err'); if (!p) return;
    p.textContent = msg; p.classList.toggle('hidden', !msg);
  }

  function saveForm() {
    var amount = parseAmount($('#f-amt').value);
    F.note = $('#f-note').value.trim();
    F.doubtNote = $('#f-dnote').value.trim();
    if ($('#f-answer')) F.answer = $('#f-answer').value.trim();
    if (!amount) { formError('金額を入れてください'); $('#f-amt').focus(); return; }
    if (!F.cat) { formError('分類を選んでください（わからないときは「わからない」）'); return; }
    var isNew = !F.id;
    var e = isNew ? { id: newId(), created: Date.now() } : findE(F.id);
    if (!e) { closeSheet(); render(); return; }
    var wasDoubt = !!e.doubt;
    e.amount = amount; e.cat = F.cat; e.date = F.date || todayStr(); e.note = F.note;
    e.doubt = F.doubt;
    e.doubtNote = (F.doubt || F.resolved) ? F.doubtNote : '';
    e.resolved = F.doubt ? false : F.resolved;
    e.answer = e.resolved ? F.answer : '';
    e.excluded = F.doubt ? false : F.excluded;  // もう一度「迷ってる」にしたら、外したのも取り消して迷い中に戻す
    e.updated = Date.now();
    var photo = F.photo;
    if (photo === null) e.hasPhoto = false;
    else if (typeof photo === 'string') e.hasPhoto = true;
    if (isNew) S.entries.push(e);
    if (!save()) return;
    if (photo === null) photoDel(e.id).catch(function () {});
    else if (typeof photo === 'string') photoPut(e.id, photo).catch(function () {
      e.hasPhoto = false; save(); render(true);
      toast('写真は保存できませんでした（メモは保存しました）');
    });
    var monthN = S.entries.filter(function (x) { return x.date.slice(0, 7) === e.date.slice(0, 7) && counted(x); }).length;
    closeSheet();
    V.justId = e.id;
    render(true);
    if (isNew) toast(e.doubt ? 'メモしました。迷いリストにも入れました' : 'メモしました（' + (parseD(e.date).getMonth() + 1) + '月' + monthN + '件目）');
    else toast(e.doubt && !wasDoubt ? '直しました。迷いリストに入れました' : '直しました');
  }

  /* ---------- 迷いの答えが出た ---------- */
  var R = null;
  function openResolve(id) {
    var e = findE(id); if (!e) return;
    R = { id: id, cat: e.cat };
    var c = catOf(e);
    var body = '<div class="note" style="transform:none"><div class="top-line"><span>' + mdw(e.date) + '</span><b class="num">' + yen(e.amount) + '</b></div>' +
      '<p class="what">' + c.icon + ' ' + h(c.label) + (e.note ? '　<span>' + h(e.note) + '</span>' : '') + '</p>' +
      (e.doubtNote ? '<p class="q">迷っていること：' + h(e.doubtNote) + '</p>' : '') + '</div>' +
      '<label class="f-label" for="r-answer" style="margin-top:20px">聞いた答え（メモ・なくてもOK）</label>' +
      '<textarea class="text" id="r-answer" maxlength="300" placeholder="例：仕事で使った分だけ入れてよい、と言われた"></textarea>';
    if (e.cat === 'unknown') {
      body += '<p class="f-label">分類も決めておく（なくてもOK）</p><div class="cats">' + CATS.filter(function (x) { return x.id !== 'unknown'; }).map(function (x) {
        return '<button type="button" class="cat" data-act="rcat" data-cat="' + x.id + '"><span class="ic" aria-hidden="true">' + x.icon + '</span><span>' + h(x.label) + '</span></button>';
      }).join('') + '</div>';
    }
    body += '<p class="muted" style="margin-top:14px">一部だけ経費にするときは、メモの「直す」で金額を変えて、ひとことに「全体◯円のうち」と残しておくと、あとでレシートと照らし合わせられます。</p>';
    var foot = '<div class="row"><button class="btn grow" data-act="resolveOut">経費から外す</button><button class="btn primary grow" data-act="resolveIn">経費に入れる</button></div>';
    openSheet(sheetHTML('答えが出た', body, foot));
  }
  function finishResolve(include) {
    var e = R && findE(R.id); if (!e) { closeSheet(); return; }
    e.answer = $('#r-answer').value.trim();
    e.doubt = false; e.resolved = true; e.excluded = !include;
    if (R.cat !== e.cat) e.cat = R.cat;
    e.updated = Date.now();
    save(); closeSheet(); render(true);
    toast(include ? '経費に入れました' : '経費から外しました（合計や表には入りません）');
  }

  /* ---------- 書き出し ---------- */
  function csvCell(v) {
    v = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;  // 表計算ソフトが式として読まないように
    if (/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }
  function buildCSV(list) {
    var rows = [['日付', '金額（税込）', '分類', '勘定科目（めやす）', 'ひとこと', '迷い', '迷っていること', '聞いた答え', '写真']];
    list.filter(counted).sort(byDateAsc).forEach(function (e) {
      var c = catOf(e);
      // 10万円以上の道具は入れ方が変わることがあるので、科目のめやすに「要確認」と添えるだけにする（判断はしない）
      var kamoku = (e.cat === 'tool' && e.amount >= 100000) ? c.kamoku + '？（10万円以上は要確認）' : c.kamoku;
      rows.push([e.date.replace(/-/g, '/'), e.amount, c.label, kamoku,e.note || '', e.doubt ? '迷い中' : (e.resolved ? '答えが出た' : ''), e.doubtNote || '', e.answer || '', e.hasPhoto ? 'あり' : '']);
    });
    // 先頭のBOMで、Excelでも文字化けしない
    return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }

  function saveFile(name, blob) {
    var file = null;
    try { file = new File([blob], name, { type: blob.type }); } catch (e) {}
    if (file && isMobile() && navigator.canShare && navigator.share) {
      var ok = false;
      try { ok = navigator.canShare({ files: [file] }); } catch (e) {}
      if (ok) {
        return navigator.share({ files: [file], title: name }).then(function () { return 'shared'; }, function (err) {
          if (err && err.name === 'AbortError') return 'cancel';
          download(name, blob); return 'downloaded';
        });
      }
    }
    download(name, blob);
    return Promise.resolve('downloaded');
  }
  function download(name, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }

  function exportCSV(mode) {
    var list, name;
    if (mode === 'year') { list = S.entries.filter(function (e) { return inYear(e, V.y); }); name = '経費一覧_' + V.y + '年.csv'; }
    else { list = S.entries.filter(function (e) { return inMonth(e, V.y, V.m); }); name = '経費一覧_' + V.y + '年' + V.m + '月.csv'; }
    if (!list.filter(counted).length) { toast('表に入るメモがありません'); return; }
    var blob = new Blob([buildCSV(list)], { type: 'text/csv;charset=utf-8' });
    saveFile(name, blob).then(function (r) {
      if (r === 'downloaded') toast('「' + name + '」を保存しました');
      else if (r === 'shared') toast('表を送りました');
    });
  }

  function doubtText() {
    var list = doubts().sort(byDateAsc);
    var lines = ['【経費になるか迷っているもの】' + list.length + '件', ''];
    list.forEach(function (e, i) {
      var c = catOf(e);
      lines.push((i + 1) + '. ' + parseD(e.date).getFullYear() + '年' + mdw(e.date) + '　' + e.amount.toLocaleString('ja-JP') + '円');
      lines.push('　分類：' + c.label + (e.note ? '／' + e.note : ''));
      if (e.doubtNote) lines.push('　迷っていること：' + e.doubtNote);
      lines.push('');
    });
    return lines.join('\n').trim() + '\n';
  }
  function shareDoubts() {
    var text = doubtText();
    if (isMobile() && navigator.share) {
      navigator.share({ text: text }).then(function () { toast('迷いリストを送りました'); }, function (err) {
        if (!err || err.name !== 'AbortError') copyText(text);
      });
      return;
    }
    copyText(text);
  }
  function copyText(text) {
    var done = function () { toast('コピーしました。LINEやメールに貼れます'); };
    var fallback = function () {
      openSheet(sheetHTML('迷いリストの文', '<p class="muted">下の文を長押しして、すべて選択 → コピーしてください。</p><textarea class="text copybox" readonly>' + h(text) + '</textarea>'));
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  /* ---------- 控え（バックアップ） ---------- */
  function makeBackup() {
    var ids = S.entries.filter(function (e) { return e.hasPhoto; }).map(function (e) { return e.id; });
    var photos = {};
    return Promise.all(ids.map(function (id) {
      return photoGet(id).then(function (d) { if (d) photos[id] = d; }).catch(function () {});
    })).then(function () {
      return { app: 'keihi-aikata', kind: 'backup', v: 1, saved: new Date().toISOString(), entries: S.entries, photos: photos };
    });
  }
  function startBackup() {
    makeBackup().then(function (data) {
      var np = Object.keys(data.photos).length;
      var name = '経費メモ_控え_' + todayStr() + '.json';
      var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      var body = '<p>メモ ' + data.entries.length + '件・写真 ' + np + '枚の控えができました。</p>' +
        '<p class="muted">「保存する」を押して、ファイルに保存するか、自分あてのメールやLINEに送ってください。iPhoneでは「“ファイル”に保存」を選ぶと、あとで「控えから戻す」で選べます。</p>' +
        '<p class="muted">ファイル名：' + h(name) + '（' + Math.max(1, Math.round(blob.size / 1024)) + 'KB）</p>';
      openSheet(sheetHTML('控えを保存', body, '<button class="btn primary big" data-act="backupGo">保存する</button>'), function () {
        pendingBackup = { name: name, blob: blob };
      });
    });
  }
  var pendingBackup = null;
  function backupGo() {
    if (!pendingBackup) return;
    var p = pendingBackup;
    saveFile(p.name, p.blob).then(function (r) {
      if (r === 'cancel') return;
      S.settings.lastBackup = Date.now(); save();
      pendingBackup = null;
      closeSheet(); render(true);
      toast('控えを保存しました');
    });
  }
  // 控えファイルの中身は、決まった形のものだけ受け取る（画面に変なものが入らないように）
  function isPhotoData(v) { return typeof v === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v); }
  function cleanEntry(e) {
    if (!e || typeof e !== 'object') return null;
    var id = String(e.id || '');
    if (!/^[a-z0-9]{1,40}$/i.test(id)) return null;
    var amount = Math.round(Number(e.amount));
    if (!isFinite(amount) || amount <= 0 || amount > 999999999) return null;
    var date = String(e.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    var dp = parseD(date);
    if (ymd(dp) !== date) return null;  // 2026-13-45 のような、ない日付は受け取らない
    var str = function (v, n) { return String(v == null ? '' : v).slice(0, n); };
    var doubt = !!e.doubt;
    return {
      id: id, created: Number(e.created) || Date.now(), updated: Number(e.updated) || Date.now(),
      amount: amount, cat: CAT[e.cat] ? e.cat : 'other', date: date, note: str(e.note, 80),
      doubt: doubt, doubtNote: str(e.doubtNote, 300), resolved: !doubt && !!e.resolved, answer: str(e.answer, 300),
      excluded: !doubt && !!e.excluded, hasPhoto: !!e.hasPhoto
    };
  }
  function restoreFrom(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (e) { data = null; }
      if (!data || data.app !== 'keihi-aikata' || !Array.isArray(data.entries)) {
        toast('このアプリの控えファイルではないようです'); return;
      }
      var have = {};
      S.entries.forEach(function (e) { have[e.id] = true; });
      var photos = (data.photos && typeof data.photos === 'object') ? data.photos : {};
      var seen = {};
      var valid = data.entries.map(cleanEntry).filter(function (e) { if (!e || seen[e.id]) return false; seen[e.id] = true; return true; });
      valid.forEach(function (e) { if (e.hasPhoto && !isPhotoData(photos[e.id])) e.hasPhoto = false; });
      var add = valid.filter(function (e) { return !have[e.id]; });
      var dup = valid.length - add.length, bad = data.entries.length - valid.length;
      if (!add.length) { toast(dup ? '控えのメモは、すべて入っています' : '戻せるメモがありませんでした'); return; }
      confirmBox('控えから戻しますか？', '控えのメモ ' + data.entries.length + '件のうち、' + add.length + '件を足します。' +
        (dup ? '\n' + dup + '件はすでに入っているので足しません。' : '') + (bad ? '\n' + bad + '件は読めなかったので足しません。' : '') + '\nいまのメモは消えません。', '戻す').then(function (ok) {
        if (!ok) return;
        var before = S.entries.slice();
        add.forEach(function (e) { S.entries.push(e); });
        if (!save()) { S.entries = before; return; }
        Promise.all(add.filter(function (e) { return e.hasPhoto; }).map(function (e) { return photoPut(e.id, photos[e.id]).catch(function () {}); })).then(function () {
          render(true);
          toast(add.length + '件のメモを戻しました');
        });
      });
    };
    reader.onerror = function () { toast('ファイルを読めませんでした'); };
    reader.readAsText(file);
  }

  /* ---------- 確認の小窓・お知らせ ---------- */
  function confirmBox(title, body, okLabel, danger) {
    return new Promise(function (res) {
      var m = document.createElement('div');
      m.className = 'modal';
      m.innerHTML = '<div class="box" role="alertdialog" aria-modal="true" aria-label="' + h(title) + '"><h3>' + h(title) + '</h3>' + (body ? '<p>' + h(body) + '</p>' : '') +
        '<div class="row end"><button class="btn ghost" data-r="0">やめる</button><button class="btn ' + (danger ? 'danger' : 'primary') + '" data-r="1">' + h(okLabel) + '</button></div></div>';
      m.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-r]');
        if (!b && ev.target !== m) return;
        m.remove();
        res(!!b && b.dataset.r === '1');
      });
      document.body.appendChild(m);
      m.querySelector('[data-r="1"]').focus();
    });
  }
  var toastTimer = null;
  function toast(msg, actLabel, fn) {
    var t = $('#toast');
    t.innerHTML = '<span>' + h(msg) + '</span>' + (actLabel ? '<button type="button">' + h(actLabel) + '</button>' : '');
    t.classList.remove('hidden');
    undoShowing = !!actLabel;
    if (actLabel) t.querySelector('button').onclick = function () { t.classList.add('hidden'); undoShowing = false; fn(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); undoShowing = false; }, actLabel ? 6000 : 3200);
  }

  /* ---------- 消す（5秒間は元に戻せる） ---------- */
  function deleteEntry(id) {
    var e = findE(id); if (!e) return;
    confirmBox('このメモを消しますか？', mdw(e.date) + '　' + catOf(e).label + '　' + yen(e.amount), '消す', true).then(function (ok) {
      if (!ok) return;
      var keep = JSON.parse(JSON.stringify(e));
      var photoP = e.hasPhoto ? photoGet(id).catch(function () { return null; }) : Promise.resolve(null);
      photoP.then(function (photo) {
        S.entries = S.entries.filter(function (x) { return x.id !== id; });
        save();
        if (photo) photoDel(id).catch(function () {});
        closeSheet(); render(true);
        toast('メモを消しました', '元に戻す', function () {
          S.entries.push(keep); save();
          if (photo) photoPut(id, photo).catch(function () {});
          V.justId = id; render(true);
        });
      });
    });
  }
  function wipeAll() {
    confirmBox('メモをぜんぶ消しますか？', 'メモ ' + S.entries.length + '件と写真がすべて消えます。消したメモは戻せません。\n残したいときは、先に「控えを保存する」を押してください。', 'ぜんぶ消す', true).then(function (ok) {
      if (!ok) return;
      S.entries = []; S.settings.lastBackup = 0; save();
      db().then(function (d) { var t = d.transaction('photos', 'readwrite'); t.objectStore('photos').clear(); }).catch(function () {});
      render(); toast('ぜんぶ消しました');
    });
  }

  /* ---------- 押したときの動き ---------- */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var act = el.dataset.act;
    switch (act) {
      case 'start': S.settings.introDone = true; save(); render(); break;
      case 'tab': if (sheetOpen) closeSheet(); V.tab = el.dataset.tab; if (V.tab === 'summary') { var n = new Date(); if (V.sumMode === 'month' && !S.entries.some(function (e) { return inMonth(e, V.y, V.m); })) { V.y = n.getFullYear(); V.m = n.getMonth() + 1; } } render(); break;
      case 'new': openForm(null); break;
      case 'edit': openForm(el.dataset.id); break;
      case 'close': closeSheet(); break;
      case 'cat':
        F.cat = el.dataset.cat;
        if (F.cat === 'unknown' && !F.doubt) { F.doubt = true; updateDoubt(); }
        var a = $('#f-amt'); if (a && document.activeElement === a) a.blur();
        updateCat(); formError('');
        break;
      case 'when': F.date = el.dataset.when === 'yesterday' ? yesterdayStr() : todayStr(); updateWhen(); break;
      case 'doubt': F.doubt = !F.doubt; updateDoubt(); if (F.doubt) setTimeout(function () { var q = $('#f-dq'); if (q) q.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 30); break;
      case 'removePhoto': F.photo = null; F.hasPhoto = false; showThumb(null); break;
      case 'viewPhoto':
        var src = el.querySelector('img').src;
        var pv = document.createElement('div');
        pv.className = 'modal photo-view';
        pv.innerHTML = '<img alt="レシートの写真" src="' + h(src) + '"><button class="btn" type="button">とじる</button>';
        pv.addEventListener('click', function () { pv.remove(); });
        document.body.appendChild(pv);
        break;
      case 'unexclude': F.excluded = false; var ob = el.closest('.out-box'); if (ob) ob.remove(); toast('保存すると、合計や表に入ります'); break;
      case 'saveForm': saveForm(); break;
      case 'deleteE': deleteEntry(F.id); break;
      case 'resolve': openResolve(el.dataset.id); break;
      case 'rcat':
        R.cat = R.cat === el.dataset.cat ? 'unknown' : el.dataset.cat;
        Array.prototype.forEach.call($('#layer').querySelectorAll('[data-act="rcat"]'), function (b) { b.classList.toggle('on', b.dataset.cat === R.cat); });
        break;
      case 'resolveIn': finishResolve(true); break;
      case 'resolveOut': finishResolve(false); break;
      case 'shareDoubts': shareDoubts(); break;
      case 'sumMode': V.sumMode = el.dataset.mode; render(true); break;
      case 'prevM': V.m--; if (V.m < 1) { V.m = 12; V.y--; } render(true); break;
      case 'nextM': V.m++; if (V.m > 12) { V.m = 1; V.y++; } render(true); break;
      case 'prevY': V.y--; render(true); break;
      case 'nextY': V.y++; render(true); break;
      case 'goMonth': V.m = +el.dataset.m; V.sumMode = 'month'; render(); break;
      case 'yearsheet': V.tab = 'summary'; V.sumMode = 'year'; V.y = +el.dataset.y; render(); break;
      case 'csv': exportCSV(el.dataset.mode); break;
      case 'backup': startBackup(); break;
      case 'backupGo': backupGo(); break;
      case 'snoozeBackup': S.settings.snoozeBackup = Date.now() + 7 * DAY; save(); render(true); break;
      case 'hideA2HS': S.settings.hideA2HS = true; save(); render(true); break;
      case 'showIntro': openSheet(sheetHTML('つかいかた', introHTML(true), '<button class="btn primary big" data-act="close">とじる</button>')); break;
      case 'wipe': wipeAll(); break;
    }
  });

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id === 'f-amt') {
      var n = parseAmount(t.value);
      t.value = n ? n.toLocaleString('ja-JP') : '';
      formError('');
    }
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.id === 'f-date' && F) { F.date = t.value || todayStr(); updateWhen(); }
    if (t.id === 'f-file' && F && t.files && t.files[0]) {
      var lbl = $('#f-photo-lbl'); if (lbl) lbl.textContent = '読み込み中…';
      compressImage(t.files[0]).then(function (d) { if (!F) return; F.photo = d; F.hasPhoto = true; showThumb(d); }, function () {
        toast('この写真は読み込めませんでした'); showThumb(null);
      });
      t.value = '';
    }
    if (t.id === 'restore-file' && t.files && t.files[0]) { restoreFrom(t.files[0]); t.value = ''; }
  });
  // 入力欄でEnterを押したら保存
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && F && (ev.target.id === 'f-amt' || ev.target.id === 'f-note') && !ev.isComposing) { ev.preventDefault(); saveForm(); }
    if (ev.key === 'Escape' && sheetOpen && !document.querySelector('.modal')) closeSheet();
  });

  // 日付が変わったまま開きっぱなしでも、戻ってきたら描き直す
  var lastDay = todayStr();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && todayStr() !== lastDay) { lastDay = todayStr(); if (!sheetOpen) render(true); }
  });

  render();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
    // 新しい版が届いたら1回だけ読み込み直す（入力中なら、閉じてから）
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloaded) return;
      if (sheetOpen || undoShowing) { pendingReload = true; return; }
      reloaded = true; location.reload();
    });
  }

  // 動作確認用（画面には出ない）
  window.__keihi = { deadlineInfo: deadlineInfo, buildCSV: buildCSV, doubtText: doubtText, parseAmount: parseAmount };
})();
