// ===================== 資料：投稿者名 + 保存ボタン（追加機能） =====================
// 既存の資料一覧（.pdf-item）が描画されるたびに、あとから
//   ・「投稿者：○○」を表示
//   ・「保存」ボタンを追加
// する。manabu.html / index.html 本体は一切書き換えない。
// 失敗しても既存の「タップで開く」動作には影響しない（全部 try/catch）。
(function(){
  if (window.__kpDocsExtra) return;
  window.__kpDocsExtra = true;

  var nameCache = null;      // storage_path -> 投稿者名
  var loading = false;
  var pending = false;
  var retried = {};

  var css = document.createElement('style');
  css.textContent =
    '.kp-dl-btn{flex:none;border:1px solid rgba(0,0,0,.15);background:#fff;color:#1a56a0;' +
    'border-radius:10px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;' +
    'margin-left:6px;-webkit-tap-highlight-color:transparent;font-family:inherit;line-height:1.2}' +
    '.kp-dl-btn:active{opacity:.6}.kp-dl-btn[disabled]{opacity:.5}' +
    '.kp-uploader{display:inline}';
  document.head.appendChild(css);

  function getClient(){
    try { if (typeof _supabase !== 'undefined' && _supabase) return _supabase; } catch(e){}
    return window._supabase || null;
  }

  function loadNames(cb){
    var sb = getClient();
    if (!sb) { cb(); return; }
    if (loading) return;
    loading = true;
    try {
      sb.from('content_files').select('storage_path, uploaded_by_name').then(function(res){
        loading = false;
        var m = {};
        if (res && !res.error && res.data) {
          res.data.forEach(function(r){ if (r.storage_path) m[r.storage_path] = r.uploaded_by_name || ''; });
        }
        nameCache = m;
        cb();
      }, function(){ loading = false; nameCache = {}; cb(); });
    } catch(e){ loading = false; nameCache = {}; cb(); }
  }

  function fileNameOf(item){
    var el = item.querySelector('.pdf-item-name');
    var n = el ? (el.textContent || '').trim() : '';
    if (!n) n = 'document.pdf';
    return n;
  }

  function download(btn, item){
    var sb = getClient();
    var path = item.getAttribute('data-path');
    if (!sb || !path) return;
    var orig = btn.textContent;
    btn.disabled = true; btn.textContent = '準備中…';
    var fname = fileNameOf(item);
    sb.storage.from('content-pdfs').createSignedUrl(path, 300, { download: fname }).then(function(res){
      btn.disabled = false; btn.textContent = orig;
      if (!res || res.error || !res.data || !res.data.signedUrl) {
        alert('保存に失敗しました。通信状態を確認して、もう一度お試しください。');
        return;
      }
      var a = document.createElement('a');
      a.href = res.data.signedUrl;
      a.download = fname;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(function(){ if (a.parentNode) a.parentNode.removeChild(a); }, 1000);
    }, function(){
      btn.disabled = false; btn.textContent = orig;
      alert('保存に失敗しました。通信状態を確認して、もう一度お試しください。');
    });
  }

  function decorate(){
    pending = false;
    var items = document.querySelectorAll('.pdf-item');
    if (!items.length) return;
    if (nameCache === null) { loadNames(decorate); return; }
    Array.prototype.forEach.call(items, function(item){
      try {
        var path = item.getAttribute('data-path');
        // 投稿者名
        var meta = item.querySelector('.pdf-item-meta');
        if (meta && !meta.querySelector('.kp-uploader')) {
          var nm = nameCache[path];
          if (nm === undefined && !retried[path]) { /* 新規アップ直後：1回だけ再取得 */ retried[path] = true; nameCache = null; loadNames(decorate); return; }
          var span = document.createElement('span');
          span.className = 'kp-uploader';
          span.textContent = ' · 投稿者：' + (nm || '不明');
          meta.appendChild(span);
        }
        // 保存ボタン
        if (!item.querySelector('.kp-dl-btn')) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'kp-dl-btn';
          b.textContent = '保存';
          b.setAttribute('aria-label', '資料を保存');
          b.addEventListener('click', function(ev){
            ev.stopPropagation(); ev.preventDefault();
            download(b, item);
          });
          var del = item.querySelector('.pdf-item-del');
          if (del) item.insertBefore(b, del); else item.appendChild(b);
        }
      } catch(e){}
    });
  }

  function schedule(){
    if (pending) return;
    pending = true;
    (window.requestAnimationFrame || setTimeout)(decorate, 50);
  }

  function start(){
    try {
      new MutationObserver(function(muts){
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType === 1 && (n.matches && n.matches('.pdf-item') || n.querySelector && n.querySelector('.pdf-item'))) { schedule(); return; }
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    } catch(e){}
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
