// ===================== 下部タブバー（現在地ハイライト＋追加機能の読み込み） =====================
// 4タブ構成（ホーム／まなぶ／カレンダー／チャット）。
// 質問（チャット）タブ。アカウント設定はホーム左上のアイコンから開く。
//
// 2026-10 更新で追加したもの（このファイルだけ差し替えれば有効になる）：
//   ① チャットタブの未読バッジ（通知が来ていると赤い数字が出る）
//   ② iPad／広い画面での見た目の調整（画面最上部の見切れ対策・タブバーの幅）
//   ③ 追加スクリプトの読み込み
//        index.html / manabu.html  → kpics-docs-extra.js （資料の保存ボタン・投稿者名）
//        questions.html            → questions-extra.js  （通知ベル・リアクション）
//   ④ 表示診断パネル（タブバーを素早く3回タップ）
(function(){
  var fileToTab = {
    'index.html': 'home',
    '': 'home', // ルート直下でindex.htmlが省略された場合
    'manabu.html': 'manabu',
    'calendar.html': 'calendar',
    'questions.html': 'other',
    'account.html': 'home',
    'prep.html': 'manabu',
    'prep-detail.html': 'manabu',
    'wiki-detail.html': 'manabu'
  };
  var EXTRA_VERSION = '20261026';
  var pageFile = window.location.pathname.split('/').pop();

  function highlightCurrentTab(){
    var currentTab = fileToTab[pageFile];
    if(!currentTab) return;

    var items = document.querySelectorAll('.tabbar-item');
    items.forEach(function(item){
      if(item.getAttribute('data-tab') === currentTab){
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  // ---------- 端末の判定（iPad／ホーム画面から開いているか） ----------
  var ua = navigator.userAgent || '';
  var isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isStandalone = false;
  try {
    isStandalone = !!navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  } catch(e){}
  var root = document.documentElement;
  if(isIPad) root.classList.add('kp-ipad');
  if(isStandalone) root.classList.add('kp-standalone');
  if(pageFile === 'manabu.html') root.classList.add('kp-manabu');

  // ---------- 追加CSS ----------
  var css = document.createElement('style');
  css.setAttribute('data-kp', 'tabbar-extra');
  css.textContent =
    /* チャットタブの未読バッジ */
    '.tabbar-item{position:relative;}' +
    '.kp-tab-badge{position:absolute;top:3px;left:calc(50% + 6px);min-width:16px;height:16px;padding:0 4px;' +
    'border-radius:999px;background:#F06060;color:#fff;font-size:10px;font-weight:800;line-height:16px;' +
    'text-align:center;font-family:"JetBrains Mono",monospace;box-sizing:border-box;pointer-events:none;}' +
    '.kp-tab-badge[hidden]{display:none;}' +

    /* iPad（ホーム画面から開いたとき）：画面の一番上は、iPadOS側が「ぼかし」をかける帯になっている。
       その帯にヘッダーの文字が入ってボヤけるので、上の余白を最低92px確保して帯の下から始める。
       数字(92px)を大きくすると下がり、小さくすると上がる。 */
    'html.kp-ipad.kp-standalone{--kp-st:max(env(safe-area-inset-top,0px),92px);}' +
    'html.kp-ipad.kp-standalone .top-header{padding-top:var(--kp-st)!important;}' +
    'html.kp-ipad.kp-standalone.kp-manabu .top-header{padding-top:calc(18px + var(--kp-st))!important;}' +
    'html.kp-ipad.kp-standalone .home-header{padding-top:calc(14px + var(--kp-st))!important;}' +
    'html.kp-ipad.kp-standalone .hp-top{padding-top:calc(10px + var(--kp-st))!important;}' +
    'html.kp-ipad.kp-standalone .snav{top:var(--kp-st)!important;}' +
    'html.kp-ipad.kp-standalone .status-shade{height:var(--kp-st)!important;}' +

    /* 広い画面（iPad・PC）：タブバーを中央の読みやすい幅に、＋ボタンも内容の右端に寄せる */
    '@media (min-width:768px){' +
    '.tabbar{left:50%!important;right:auto!important;width:min(100%,720px);transform:translateX(-50%);' +
    'border-left:1px solid var(--border,#2A2A2A);border-right:1px solid var(--border,#2A2A2A);border-radius:18px 18px 0 0;}' +
    '.fab{right:max(20px,calc(50% - 340px))!important;}' +
    '}' +

    /* 広い画面のホーム：中身を少し広げ、縦の余白を使ってゆったり見せる（スマホは対象外） */
    '@media (min-width:768px) and (min-height:900px){' +
    '.home-header-top,.home-body{max-width:760px!important;}' +
    '.home-body{gap:14px!important;}' +
    '.echo-hero{min-height:300px!important;max-height:380px!important;}' +
    '.pillar{min-height:210px!important;}' +
    '}' +

    /* 診断パネル */
    '#kp-diag{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:20px;}' +
    '#kp-diag .box{background:#141414;border:1px solid #333;border-radius:14px;padding:18px;max-width:420px;width:100%;color:#F0F0F0;font-family:sans-serif;}' +
    '#kp-diag pre{white-space:pre-wrap;font-size:12px;line-height:1.7;margin:10px 0;color:#ddd;}' +
    '#kp-diag button{padding:9px 14px;border-radius:8px;border:1px solid #444;background:#222;color:#fff;font-size:13px;margin-right:8px;}';
  (document.head || document.documentElement).appendChild(css);

  // ---------- 未読バッジ ----------
  var badgeEl = null;
  function ensureBadgeEl(){
    if(badgeEl && badgeEl.parentNode) return badgeEl;
    var tab = document.querySelector('.tabbar-item[data-tab="other"]');
    if(!tab) return null;
    badgeEl = tab.querySelector('.kp-tab-badge');
    if(!badgeEl){
      badgeEl = document.createElement('span');
      badgeEl.className = 'kp-tab-badge';
      badgeEl.hidden = true;
      tab.appendChild(badgeEl);
    }
    return badgeEl;
  }
  // questions-extra.js からも呼ぶ
  window.kpSetNotifBadge = function(n){
    var el = ensureBadgeEl();
    if(!el) return;
    if(n > 0){ el.textContent = n > 9 ? '9+' : String(n); el.hidden = false; }
    else { el.hidden = true; el.textContent = ''; }
  };

  function sbClient(){
    try { if(typeof _supabase !== 'undefined' && _supabase) return _supabase; } catch(e){}
    return window._supabase || null;
  }
  function refreshBadge(){
    var sb = sbClient();
    if(!sb || !window.CURRENT_UID) return;
    try {
      sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null).then(function(res){
        if(res && !res.error && typeof res.count === 'number') window.kpSetNotifBadge(res.count);
      }, function(){});
    } catch(e){}
  }
  function startBadge(){
    if(!document.querySelector('.tabbar-item[data-tab="other"]')) return;
    var tries = 0;
    (function wait(){
      if(window.CURRENT_UID && sbClient()){
        refreshBadge();
        setInterval(function(){ if(!document.hidden) refreshBadge(); }, 90000);
        document.addEventListener('visibilitychange', function(){ if(!document.hidden) refreshBadge(); });
        return;
      }
      if(++tries < 60) setTimeout(wait, 500); // 最大30秒待つ（ログイン前は何もしない）
    })();
  }

  // ---------- 追加スクリプトの読み込み ----------
  function loadExtra(name){
    var s = document.createElement('script');
    var base = '';
    try {
      var cs = document.querySelector('script[src*="tabbar.js"]');
      if(cs){ var src = cs.getAttribute('src'); base = src.replace(/tabbar\.js.*$/, ''); }
    } catch(e){}
    s.src = base + name + '?v=' + EXTRA_VERSION;
    s.async = true;
    document.body.appendChild(s);
  }
  function loadExtras(){
    if(pageFile === 'questions.html') loadExtra('questions-extra.js');
    if(pageFile === 'index.html' || pageFile === '' || pageFile === 'manabu.html') loadExtra('kpics-docs-extra.js');
  }

  // ---------- 表示診断（タブバーを素早く3回タップ） ----------
  function showDiag(){
    if(document.getElementById('kp-diag')) return;
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;';
    document.body.appendChild(probe);
    var cs = getComputedStyle(probe);
    var top = cs.paddingTop, bottom = cs.paddingBottom;
    document.body.removeChild(probe);
    var lines = [
      '画面: ' + window.innerWidth + ' x ' + window.innerHeight,
      '画面(端末): ' + screen.width + ' x ' + screen.height,
      '倍率: ' + window.devicePixelRatio,
      '上の余白(safe-area): ' + top,
      '下の余白(safe-area): ' + bottom,
      'ホーム画面から起動: ' + (isStandalone ? 'はい' : 'いいえ'),
      'iPad判定: ' + (isIPad ? 'はい' : 'いいえ'),
      '向き: ' + ((window.innerWidth > window.innerHeight) ? '横' : '縦'),
      'ページ: ' + (pageFile || 'index.html')
    ];
    var d = document.createElement('div');
    d.id = 'kp-diag';
    d.innerHTML = '<div class="box"><b>表示の診断</b><pre></pre><button type="button" id="kp-diag-close">閉じる</button></div>';
    d.querySelector('pre').textContent = lines.join('\n');
    d.addEventListener('click', function(ev){ if(ev.target === d || ev.target.id === 'kp-diag-close') d.remove(); });
    document.body.appendChild(d);
  }
  function bindDiag(){
    var bar = document.getElementById('main-tabbar') || document.querySelector('.tabbar');
    if(!bar) return;
    var taps = [];
    var timer = null;
    // 「いま開いているタブ」を素早く3回タップすると診断パネルが開く。
    // 1〜2回タップのときは、これまでどおり0.5秒後にそのページを開き直す（動作は変わらない）。
    bar.addEventListener('click', function(ev){
      var item = ev.target.closest ? ev.target.closest('.tabbar-item.active') : null;
      if(!item) return;
      ev.preventDefault();
      var now = Date.now();
      taps = taps.filter(function(t){ return now - t < 1200; });
      taps.push(now);
      clearTimeout(timer);
      if(taps.length >= 3){ taps = []; showDiag(); return; }
      var href = item.getAttribute('href');
      timer = setTimeout(function(){ taps = []; if(href) window.location.href = href; }, 500);
    }, true);
  }

  function init(){
    highlightCurrentTab();
    startBadge();
    loadExtras();
    bindDiag();
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
