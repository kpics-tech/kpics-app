// ===================== チャット追加機能：通知ベル ＋ リアクション =====================
// questions.js の「あと」に読み込まれ、既存の関数を“包んで”機能を足す。
// questions.js / questions.html 本体は書き換えない。
// Supabase 側で kpics_2026-10_update.sql を実行する前は、何も表示せず従来どおり動く。
(function(){
  if (window.__kpQExtra) return;
  if (typeof renderQuestionCard !== 'function' || typeof renderReplyBox !== 'function' ||
      typeof toggleReplies !== 'function' || typeof ensureReplyMeta !== 'function') {
    console.warn('[kp] questions.js が見つからないため追加機能を読み込みませんでした');
    return;
  }
  window.__kpQExtra = true;

  var KINDS = [
    { k: 'good',   e: '👍', l: 'いいね' },
    { k: 'thanks', e: '🙏', l: 'ありがとう' },
    { k: 'aha',    e: '💡', l: 'なるほど' }
  ];

  function sb(){ return _supabase; }
  function esc(s){ return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }
  function isMissingTable(err){
    if (!err) return false;
    var m = (err.message || '') + ' ' + (err.code || '');
    return /42P01|PGRST205|PGRST200|does not exist|schema cache|Could not find the table/i.test(m);
  }

  // ---------------- CSS ----------------
  var css = document.createElement('style');
  css.textContent =
    '.kp-rx{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px;}' +
    '.q-reply-body .kp-rx{margin:6px 0 0;}' +
    '.kp-rx-btn{display:inline-flex;align-items:center;gap:4px;min-height:30px;padding:3px 11px;border-radius:999px;' +
    'border:1px solid var(--border-light,#333);background:transparent;color:var(--text-muted,#888);font-size:13px;' +
    'cursor:pointer;font-family:inherit;line-height:1;-webkit-tap-highlight-color:transparent;transition:all .12s;}' +
    '.kp-rx-btn:active{transform:scale(.94);}' +
    '.kp-rx-btn.on{border-color:var(--orange,#E8A020);background:var(--orange-bg,rgba(232,160,32,.08));color:var(--orange-light,#F5B84A);}' +
    '.kp-rx-n{font-size:11.5px;font-weight:700;font-family:"JetBrains Mono",monospace;}' +
    '.kp-bell{position:relative;flex-shrink:0;width:34px;height:34px;border-radius:50%;background:var(--card,#1A1A1A);' +
    'border:1px solid var(--border,#2A2A2A);color:var(--text-muted,#888);display:none;align-items:center;justify-content:center;cursor:pointer;}' +
    '.kp-bell.ready{display:flex;}' +
    '.kp-bell svg{width:17px;height:17px;}' +
    '.kp-bell-badge{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;' +
    'background:#F06060;color:#fff;font-size:10px;font-weight:800;line-height:16px;text-align:center;box-sizing:border-box;}' +
    '.kp-bell-badge[hidden]{display:none;}' +
    '.kp-n-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;}' +
    '.kp-n-all{background:none;border:none;color:var(--orange,#E8A020);font-size:12px;font-weight:700;cursor:pointer;padding:4px 0;font-family:inherit;}' +
    '.kp-n-item{display:flex;gap:10px;padding:13px 2px;border-bottom:1px solid var(--border,#2A2A2A);cursor:pointer;}' +
    '.kp-n-item:last-child{border-bottom:none;}' +
    '.kp-n-dot{flex-shrink:0;width:8px;height:8px;border-radius:50%;margin-top:7px;background:transparent;}' +
    '.kp-n-item.unread .kp-n-dot{background:var(--orange,#E8A020);}' +
    '.kp-n-main{flex:1;min-width:0;}' +
    '.kp-n-text{font-size:13px;line-height:1.6;color:var(--text,#F0F0F0);}' +
    '.kp-n-item:not(.unread) .kp-n-text{color:var(--text-muted,#888);}' +
    '.kp-n-prev{font-size:11.5px;color:var(--text-dim,#555);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.kp-n-time{font-size:10px;color:var(--text-dim,#555);margin-top:3px;}' +
    '.kp-n-empty{text-align:center;padding:36px 10px;color:var(--text-dim,#555);font-size:12.5px;line-height:1.8;}' +
    '@keyframes kpFlash{0%{box-shadow:0 0 0 2px rgba(232,160,32,.9);}100%{box-shadow:0 0 0 2px rgba(232,160,32,0);}}' +
    '.q-card.kp-flash{animation:kpFlash 1.6s ease-out 1;}';
  document.head.appendChild(css);

  // =====================================================================
  // リアクション
  // =====================================================================
  var rxOK = true;           // 表が無い（SQL未実行）なら false にして何も出さない
  var rxData = {};           // 'question:12' -> { good:{n,mine}, thanks:{...}, aha:{...} }
  var rxLoaded = {};         // 取得済みキー
  var rxBusy = {};

  function emptyState(){
    var o = {};
    KINDS.forEach(function(x){ o[x.k] = { n: 0, mine: false }; });
    return o;
  }
  function rxState(type, id){
    var key = type + ':' + id;
    if (!rxData[key]) rxData[key] = emptyState();
    return rxData[key];
  }

  function fetchRx(type, ids){
    if (!rxOK) return Promise.resolve();
    var need = [];
    ids.forEach(function(id){
      id = String(id);
      if (!rxLoaded[type + ':' + id] && need.indexOf(id) < 0) need.push(id);
    });
    if (!need.length) return Promise.resolve();
    var chunks = [];
    for (var i = 0; i < need.length; i += 80) chunks.push(need.slice(i, i + 80));
    return Promise.all(chunks.map(function(chunk){
      return sb().from('chat_reactions').select('target_id,user_id,kind')
        .eq('target_type', type).in('target_id', chunk).then(function(res){
          if (res.error) {
            if (isMissingTable(res.error)) rxOK = false;
            return;
          }
          chunk.forEach(function(id){ rxData[type + ':' + id] = emptyState(); rxLoaded[type + ':' + id] = true; });
          (res.data || []).forEach(function(r){
            var st = rxState(type, r.target_id);
            if (!st[r.kind]) return;
            st[r.kind].n++;
            if (r.user_id === window.CURRENT_UID) st[r.kind].mine = true;
          });
        });
    })).catch(function(){});
  }

  function barInner(type, id){
    var st = rxState(type, id);
    return KINDS.map(function(x){
      var s = st[x.k];
      return '<button type="button" class="kp-rx-btn' + (s.mine ? ' on' : '') + '" aria-pressed="' + (s.mine ? 'true' : 'false') +
        '" aria-label="' + x.l + '" onclick="kpToggleRx(\'' + type + '\',\'' + id + '\',\'' + x.k + '\')">' +
        x.e + (s.n > 0 ? '<span class="kp-rx-n">' + s.n + '</span>' : '') + '</button>';
    }).join('');
  }
  function barHtml(type, id){
    if (!rxOK) return '';
    return '<div class="kp-rx" data-rx="' + type + ':' + id + '">' + barInner(type, id) + '</div>';
  }
  function refreshBars(type, id){
    var els = document.querySelectorAll('[data-rx="' + type + ':' + id + '"]');
    for (var i = 0; i < els.length; i++) els[i].innerHTML = barInner(type, id);
  }

  window.kpToggleRx = async function(type, id, kind){
    if (!rxOK) return;
    var bkey = type + ':' + id + ':' + kind;
    if (rxBusy[bkey]) return;
    rxBusy[bkey] = true;
    var cur = rxState(type, id)[kind];
    var was = cur.mine;
    // 先に画面を変える（体感を速くする）
    cur.mine = !was; cur.n += was ? -1 : 1; if (cur.n < 0) cur.n = 0;
    refreshBars(type, id);
    try {
      var err = null;
      if (!was) {
        var r1 = await sb().from('chat_reactions').insert({ target_type: type, target_id: String(id), user_id: window.CURRENT_UID, kind: kind });
        err = r1.error;
        if (err && err.code === '23505') { cur.n = Math.max(0, cur.n - 1); err = null; } // すでに付いていた
      } else {
        var r2 = await sb().from('chat_reactions').delete()
          .eq('target_type', type).eq('target_id', String(id)).eq('user_id', window.CURRENT_UID).eq('kind', kind);
        err = r2.error;
      }
      if (err) throw err;
    } catch (e) {
      cur.mine = was; cur.n += was ? 1 : -1; if (cur.n < 0) cur.n = 0;
      refreshBars(type, id);
      alert('リアクションに失敗しました。通信状態を確認して、もう一度お試しください。');
    } finally {
      delete rxBusy[bkey];
    }
  };

  // ---- 質問カードにリアクション欄を差し込む ----
  var origCard = renderQuestionCard;
  renderQuestionCard = function(q){
    var html = origCard(q);
    var bar = barHtml('question', q.id);
    if (!bar) return html;
    return html.replace('<div class="q-actions">', function(){ return bar + '<div class="q-actions">'; });
  };

  // ---- 質問の一覧を読むときに、リアクションも一緒に取得する ----
  var origMeta = ensureReplyMeta;
  ensureReplyMeta = async function(questions){
    await origMeta(questions);
    try { await fetchRx('question', (questions || []).map(function(q){ return q.id; })); } catch (e) {}
  };

  // ---- コメントにリアクション欄を差し込む ----
  var origReplyBox = renderReplyBox;
  renderReplyBox = function(qid, replies){
    origReplyBox(qid, replies);
    if (!rxOK) return;
    try {
      var box = document.getElementById('replies-' + qid);
      var items = box ? box.querySelectorAll('.q-reply-item') : [];
      for (var i = 0; i < items.length && i < replies.length; i++) {
        var body = items[i].querySelector('.q-reply-body');
        if (body && !body.querySelector('.kp-rx')) body.insertAdjacentHTML('beforeend', barHtml('reply', replies[i].id));
      }
      fetchRx('reply', replies.map(function(r){ return r.id; })).then(function(){
        if (!rxOK) { var bars = document.querySelectorAll('.kp-rx'); for (var k = 0; k < bars.length; k++) bars[k].remove(); return; }
        replies.forEach(function(r){ refreshBars('reply', r.id); });
      });
    } catch (e) {}
  };

  // =====================================================================
  // 通知
  // =====================================================================
  var bell = null, bellBadge = null, overlay = null;
  var unreadCount = 0;

  function setCount(n){
    unreadCount = n;
    if (bellBadge) { if (n > 0) { bellBadge.textContent = n > 9 ? '9+' : String(n); bellBadge.hidden = false; } else { bellBadge.hidden = true; } }
    if (window.kpSetNotifBadge) window.kpSetNotifBadge(n);
  }

  function refreshCount(){
    return sb().from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null).then(function(res){
      if (res.error) return;                  // 表が無い等：ベルは出さない
      if (bell) bell.classList.add('ready');  // 表があるときだけベルを出す
      setCount(res.count || 0);
    }, function(){});
  }

  function buildBell(){
    var inner = document.querySelector('.top-inner');
    if (!inner || document.getElementById('kp-bell')) return;
    bell = document.createElement('button');
    bell.type = 'button';
    bell.id = 'kp-bell';
    bell.className = 'kp-bell';
    bell.setAttribute('aria-label', '通知');
    bell.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg><span class="kp-bell-badge" hidden></span>';
    bellBadge = bell.querySelector('.kp-bell-badge');
    bell.addEventListener('click', openNotifs);
    var logo = inner.querySelector('.top-logo');
    inner.insertBefore(bell, logo || null);
  }

  function notifText(n){
    var who = n.actor_name ? (n.actor_name + 'さん') : (n.type === 'reply' ? '匿名の人' : '誰か');
    if (n.type === 'reply') return who + 'があなたの質問にコメントしました';
    var emoji = '';
    KINDS.forEach(function(x){ if (x.k === n.kind) emoji = x.e; });
    var tgt = n.target_type === 'reply' ? 'あなたのコメント' : 'あなたの質問';
    return who + 'が' + tgt + 'に ' + emoji + ' を付けました';
  }

  function ensureOverlay(){
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'kp-notif-overlay';
    overlay.innerHTML =
      '<div class="modal-box"><div class="modal-head"><div class="modal-title">通知</div>' +
      '<button type="button" class="modal-close" id="kp-n-close" aria-label="閉じる">✕</button></div>' +
      '<div class="kp-n-head"><span style="font-size:11px;color:var(--text-dim,#555);">返信やリアクションが届くとここに出ます</span>' +
      '<button type="button" class="kp-n-all" id="kp-n-all">すべて既読にする</button></div>' +
      '<div id="kp-n-list"></div></div>';
    overlay.addEventListener('click', function(ev){ if (ev.target === overlay) closeNotifs(); });
    document.body.appendChild(overlay);
    overlay.querySelector('#kp-n-close').addEventListener('click', closeNotifs);
    overlay.querySelector('#kp-n-all').addEventListener('click', markAllRead);
    overlay.querySelector('#kp-n-list').addEventListener('click', function(ev){
      var it = ev.target.closest ? ev.target.closest('.kp-n-item') : null;
      if (it) openNotifItem(it.getAttribute('data-id'), it.getAttribute('data-q'));
    });
    return overlay;
  }
  function closeNotifs(){ if (overlay) overlay.classList.remove('open'); }

  async function openNotifs(){
    ensureOverlay().classList.add('open');
    var list = document.getElementById('kp-n-list');
    list.innerHTML = '<div class="kp-n-empty">読み込み中...</div>';
    var res = await sb().from('notifications').select('*').order('created_at', { ascending: false }).limit(50);
    if (res.error) { list.innerHTML = '<div class="kp-n-empty">通知の読み込みに失敗しました</div>'; return; }
    var rows = res.data || [];
    if (!rows.length) { list.innerHTML = '<div class="kp-n-empty">まだ通知はありません</div>'; return; }
    list.innerHTML = rows.map(function(n){
      var prev = n.preview ? '<div class="kp-n-prev">「' + esc(n.preview) + '」</div>' : '';
      return '<div class="kp-n-item' + (n.read_at ? '' : ' unread') + '" data-id="' + esc(n.id) + '" data-q="' + esc(n.question_id) + '">' +
        '<span class="kp-n-dot"></span><div class="kp-n-main"><div class="kp-n-text">' + esc(notifText(n)) + '</div>' + prev +
        '<div class="kp-n-time">' + esc(formatRelativeTime(n.created_at)) + '</div></div></div>';
    }).join('');
  }

  async function markAllRead(){
    await sb().from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    var its = document.querySelectorAll('#kp-n-list .kp-n-item.unread');
    for (var i = 0; i < its.length; i++) its[i].classList.remove('unread');
    setCount(0);
  }

  async function markQuestionRead(qid){
    if (!unreadCount) return;
    try {
      await sb().from('notifications').update({ read_at: new Date().toISOString() })
        .eq('question_id', String(qid)).is('read_at', null);
      refreshCount();
    } catch (e) {}
  }

  async function openNotifItem(nid, qid){
    closeNotifs();
    try { await sb().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', nid); } catch (e) {}
    refreshCount();
    await goToQuestion(qid);
  }

  async function goToQuestion(qid){
    qid = String(qid);
    var tries = 0;
    while (!document.getElementById('qcard-' + qid) && _questionsHasMore && tries < 10) {
      await loadMoreQuestions();
      tries++;
    }
    var card = document.getElementById('qcard-' + qid);
    if (!card) { alert('この投稿は見つかりませんでした（削除された可能性があります）'); return; }
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.add('kp-flash');
    setTimeout(function(){ card.classList.remove('kp-flash'); }, 1800);
    var box = document.getElementById('replies-' + qid);
    if (box && !box.classList.contains('open')) {
      _openedReplies.delete(qid);   // 一覧の再描画で見た目だけ閉じている場合に備える
      _repliesLoaded.delete(qid);
      await toggleReplies(qid);
    }
  }

  // コメント欄を開いたら、その質問の通知は既読にする
  var origToggle = toggleReplies;
  toggleReplies = async function(qid){
    var box = document.getElementById('replies-' + qid);
    var wasOpen = !!(box && box.classList.contains('open'));
    await origToggle(qid);
    if (!wasOpen) markQuestionRead(qid);
  };

  // =====================================================================
  // 起動
  // =====================================================================
  function start(){
    buildBell();
    refreshCount();
    setInterval(function(){ if (!document.hidden) refreshCount(); }, 60000);
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) refreshCount(); });

    // このスクリプトが一覧の描画より遅れて届いた場合の補正：すでにある質問カードにリアクション欄を足す
    if (typeof _questionsCache !== 'undefined' && _questionsCache.length) {
      fetchRx('question', _questionsCache.map(function(q){ return q.id; })).then(function(){
        if (!rxOK) return;
        _questionsCache.forEach(function(q){
          var card = document.getElementById('qcard-' + q.id);
          if (card && !card.querySelector('.kp-rx')) {
            var actions = card.querySelector('.q-actions');
            if (actions) actions.insertAdjacentHTML('beforebegin', barHtml('question', q.id));
          }
        });
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
