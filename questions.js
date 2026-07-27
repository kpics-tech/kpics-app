// ================================================================
// K-PICS 質問タブ ロジック
// ================================================================
// テーブル構成（Supabase側で作成する想定）：
//   questions        : id, user_id, is_anonymous, content, created_at
//   question_replies : id, question_id, user_id, is_anonymous, content, created_at
//   profiles         : id, name, role, is_teacher, is_core_member, is_certified
//
// 名前の表示ルール：
//   is_anonymous = true  → 「匿名」と表示（バッジも非表示）
//   is_anonymous = false → profilesテーブルのnameを表示（バッジも表示）
//
// 削除ルール：
//   ・自分の投稿・コメントは本人がいつでも削除できる
//   ・コアメンバー（is_core_member）は、誰の投稿・コメントでも削除できる

let _myName = '';
let _myIsCore = false;
let _questionsCache = []; // 取得した質問をキャッシュしておく（コメント開閉時の再取得を避けるため）
let _badgeMap = {}; // user_id -> {is_teacher, is_core_member, is_certified}（取得済みバッジのキャッシュ）
let _qImageUrlMap = {}; // storage_path -> signed url（質問添付画像）
let _postImageFiles = []; // 投稿モーダルで選択中の画像ファイル（最大2枚）

// ---------- 初期化：自分の名前・権限を取得してから質問一覧を読み込む ----------
async function initQuestionsPage(){
  if(window.CURRENT_UID){
    const {data:profile} = await _supabase.from('profiles').select('name,is_core_member').eq('id', window.CURRENT_UID).single();
    _myName = profile?.name || '';
    _myIsCore = !!profile?.is_core_member;
  }
  await loadQuestions();
}

// auth-guard.js がログイン確認を終えた後に呼ばれるよう、
// CURRENT_UID がセットされるのを少し待ってから初期化する
function waitForAuthThenInit(){
  if(window.CURRENT_UID){
    initQuestionsPage();
  } else {
    setTimeout(waitForAuthThenInit, 150);
  }
}
window.addEventListener('DOMContentLoaded', waitForAuthThenInit);

// ---------- バッジ情報の取得（未取得のユーザーIDだけ問い合わせる） ----------
async function ensureBadges(userIds){
  const need = [...new Set(userIds)].filter(id => id && !(id in _badgeMap));
  if(need.length === 0) return;
  const {data, error} = await _supabase
    .from('profiles')
    .select('id,is_teacher,is_core_member,is_certified')
    .in('id', need);
  if(error){ console.error('バッジ取得エラー', error); return; }
  (data || []).forEach(p => { _badgeMap[p.id] = p; });
}

function getBadgesHtml(userId, isAnonymous){
  if(isAnonymous) return ''; // 匿名投稿はバッジも非表示にする
  const b = _badgeMap[userId];
  if(!b) return '';
  let html = '';
  if(b.is_teacher)     html += `<span class="q-badge b-teacher">先生</span>`;
  if(b.is_core_member) html += `<span class="q-badge b-core">コア</span>`;
  if(b.is_certified)   html += `<span class="q-badge b-certified">認定</span>`;
  return html ? `<span class="q-badges">${html}</span>` : '';
}

function canDelete(ownerId){
  return ownerId === window.CURRENT_UID || _myIsCore;
}

// ---------- 質問一覧の読み込み ----------
async function loadQuestions(){
  const listEl = document.getElementById('q-list');
  const {data, error} = await _supabase
    .from('questions')
    .select('*')
    .order('created_at', {ascending:false});

  if(error){
    listEl.innerHTML = `<div class="empty-state">読み込みに失敗しました<br>${escapeHtml(error.message)}</div>`;
    return;
  }
  _questionsCache = data || [];
  if(_questionsCache.length === 0){
    listEl.innerHTML = `<div class="empty-state">まだ質問がありません。<br>右下の＋ボタンから最初の質問を投稿してみましょう。</div>`;
    return;
  }
  await ensureBadges(_questionsCache.map(q => q.user_id));
  await ensureQuestionImageUrls(_questionsCache);
  renderQuestions();
}

// ---------- 添付画像の署名付きURL取得（未取得のpathだけ問い合わせる） ----------
async function ensureQuestionImageUrls(questions){
  const paths = [];
  questions.forEach(q => {
    (q.image_paths || []).forEach(p => { if(p && !(p in _qImageUrlMap)) paths.push(p); });
  });
  if(paths.length === 0) return;
  await Promise.all(paths.map(async p => {
    const { data } = await _supabase.storage.from('question-images').createSignedUrl(p, 3600);
    if(data) _qImageUrlMap[p] = data.signedUrl;
  }));
}

function renderQuestions(){
  const listEl = document.getElementById('q-list');
  listEl.innerHTML = _questionsCache.map(q => renderQuestionCard(q)).join('');
}

function renderQuestionCard(q){
  const displayName = q.is_anonymous ? '匿名' : (q.author_name || '部員');
  const initial = q.is_anonymous ? '?' : (displayName ? displayName[0] : '?');
  const anonClass = q.is_anonymous ? 'anon' : '';
  const badgesHtml = getBadgesHtml(q.user_id, q.is_anonymous);
  const delBtnHtml = canDelete(q.user_id)
    ? `<button class="q-delete-btn" onclick="deleteQuestion('${q.id}')">削除</button>`
    : '';
  const imgPaths = q.image_paths || [];
  const imagesHtml = imgPaths.length > 0
    ? `<div class="q-images">${imgPaths.map(p => {
        const url = _qImageUrlMap[p] || '';
        return url ? `<img src="${url}" alt="" onclick="openLightbox('${url}')">` : '';
      }).join('')}</div>`
    : '';
  return `
    <div class="q-card" data-qid="${q.id}">
      <div class="q-card-head">
        <div class="q-author-icon ${anonClass}">${escapeHtml(initial)}</div>
        <div class="q-author ${anonClass}">${escapeHtml(displayName)}</div>
        ${badgesHtml}
        <div class="q-time">${formatRelativeTime(q.created_at)}</div>
      </div>
      <div class="q-content">${escapeHtml(q.content)}</div>
      ${imagesHtml}
      <div class="q-actions">
        <button class="q-reply-toggle" onclick="toggleReplies('${q.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
          <span id="reply-label-${q.id}">コメント</span>
        </button>
        ${delBtnHtml}
      </div>
      <div class="q-replies" id="replies-${q.id}">
        <div class="empty-state" style="padding:14px 0;">読み込み中...</div>
      </div>
    </div>
  `;
}

// ---------- 質問の削除 ----------
async function deleteQuestion(qid){
  if(!confirm('この質問を削除します。コメントもすべて削除されます。よろしいですか？')) return;
  // 先にコメントを削除（外部キー制約があっても問題ないようにするため）
  const {error: repErr} = await _supabase.from('question_replies').delete().eq('question_id', qid);
  if(repErr){ alert('削除に失敗しました: ' + repErr.message); return; }
  const {error} = await _supabase.from('questions').delete().eq('id', qid);
  if(error){ alert('削除に失敗しました: ' + error.message); return; }
  await loadQuestions();
}

// ---------- コメント開閉 ----------
const _openedReplies = new Set();
const _repliesLoaded = new Set();

async function toggleReplies(qid){
  const box = document.getElementById('replies-'+qid);
  if(_openedReplies.has(qid)){
    _openedReplies.delete(qid);
    box.classList.remove('open');
    return;
  }
  _openedReplies.add(qid);
  box.classList.add('open');
  if(!_repliesLoaded.has(qid)){
    await loadReplies(qid);
  }
}

async function loadReplies(qid){
  const box = document.getElementById('replies-'+qid);
  const {data, error} = await _supabase
    .from('question_replies')
    .select('*')
    .eq('question_id', qid)
    .order('created_at', {ascending:true});

  if(error){
    box.innerHTML = `<div class="empty-state" style="padding:14px 0;">コメントの読み込みに失敗しました</div>`;
    return;
  }
  _repliesLoaded.add(qid);
  await ensureBadges((data || []).map(r => r.user_id));
  renderReplyBox(qid, data || []);
}

function renderReplyBox(qid, replies){
  const box = document.getElementById('replies-'+qid);
  const countLabel = document.getElementById('reply-label-'+qid);
  if(countLabel) countLabel.textContent = replies.length > 0 ? `コメント (${replies.length})` : 'コメント';

  const repliesHtml = replies.map(r => {
    const name = r.is_anonymous ? '匿名' : (r.author_name || '部員');
    const anonClass = r.is_anonymous ? 'anon' : '';
    const badgesHtml = getBadgesHtml(r.user_id, r.is_anonymous);
    const delBtnHtml = canDelete(r.user_id)
      ? `<button class="q-reply-delete" onclick="deleteReply('${qid}','${r.id}')">削除</button>`
      : '';
    return `
      <div class="q-reply-item">
        <div class="q-reply-body">
          <div class="q-reply-head">
            <div class="q-reply-author ${anonClass}">${escapeHtml(name)}</div>
            ${badgesHtml}
            <div class="q-reply-time">${formatRelativeTime(r.created_at)}</div>
            ${delBtnHtml}
          </div>
          <div class="q-reply-text">${escapeHtml(r.content)}</div>
        </div>
      </div>
    `;
  }).join('');

  box.innerHTML = `
    ${repliesHtml || '<div style="font-size:11.5px;color:var(--text-dim);padding:4px 0 2px;">まだコメントはありません</div>'}
    <div class="q-reply-form">
      <div class="q-reply-input-row">
        <textarea class="q-reply-input" id="reply-input-${qid}" rows="1" placeholder="コメントする"></textarea>
        <button class="q-reply-send" onclick="submitReply('${qid}')" aria-label="送信">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
        </button>
      </div>
      <label class="q-reply-toggle-anon">
        <input type="checkbox" id="reply-anon-${qid}" style="accent-color:var(--orange);">
        匿名でコメントする
      </label>
    </div>
  `;
}

async function submitReply(qid){
  const input = document.getElementById('reply-input-'+qid);
  const anonCheckbox = document.getElementById('reply-anon-'+qid);
  const content = input.value.trim();
  if(!content) return;

  const isAnon = anonCheckbox.checked;
  const {error} = await _supabase.from('question_replies').insert({
    question_id: qid,
    user_id: window.CURRENT_UID,
    is_anonymous: isAnon,
    author_name: isAnon ? null : _myName,
    content: content
  });

  if(error){
    alert('コメントの投稿に失敗しました: ' + error.message);
    return;
  }
  input.value = '';
  _repliesLoaded.delete(qid);
  await loadReplies(qid);
}

// ---------- コメントの削除 ----------
async function deleteReply(qid, replyId){
  if(!confirm('このコメントを削除しますか？')) return;
  const {error} = await _supabase.from('question_replies').delete().eq('id', replyId);
  if(error){ alert('削除に失敗しました: ' + error.message); return; }
  _repliesLoaded.delete(qid);
  await loadReplies(qid);
}

// ---------- 質問投稿モーダル ----------
function openPostModal(){
  document.getElementById('post-content').value = '';
  document.getElementById('post-anon-toggle').checked = false;
  document.getElementById('post-error').classList.remove('show');
  _postImageFiles = [];
  renderImgAttachRow();
  document.getElementById('post-overlay').classList.add('open');
}
function closeModal(id){
  document.getElementById(id).classList.remove('open');
}
function closeOnOverlay(ev, id){
  if(ev.target.id === id) closeModal(id);
}

// ---------- 画像添付（質問投稿・最大2枚） ----------
function renderImgAttachRow(){
  const row = document.getElementById('img-attach-row');
  const thumbs = _postImageFiles.map((file, i) => {
    const url = URL.createObjectURL(file);
    return `<div class="img-attach-thumb"><img src="${url}" alt="">
      <button type="button" class="img-attach-remove" onclick="removeAttachImage(${i})">✕</button>
    </div>`;
  }).join('');
  const addBtn = _postImageFiles.length < 2
    ? `<button type="button" class="img-attach-add" onclick="document.getElementById('post-image-input').click()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        画像
      </button>`
    : '';
  row.innerHTML = thumbs + addBtn;
}

function removeAttachImage(i){
  _postImageFiles.splice(i, 1);
  renderImgAttachRow();
}

document.getElementById('post-image-input').addEventListener('change', () => {
  const input = document.getElementById('post-image-input');
  const files = Array.from(input.files || []);
  input.value = '';
  if(files.length === 0) return;

  const remaining = 2 - _postImageFiles.length;
  if(remaining <= 0){
    alert('画像は1投稿あたり2枚までです');
    return;
  }
  if(files.length > remaining){
    alert('画像は1投稿あたり2枚までです。先頭の' + remaining + '枚のみ追加します');
  }
  _postImageFiles.push(...files.slice(0, remaining));
  renderImgAttachRow();
});

// ---------- ライトボックス ----------
function openLightbox(url){
  if(!url) return;
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox-overlay').classList.add('open');
}
function closeLightbox(){
  document.getElementById('lightbox-overlay').classList.remove('open');
  document.getElementById('lightbox-img').src = '';
}

async function submitQuestion(){
  const content = document.getElementById('post-content').value.trim();
  const isAnon = document.getElementById('post-anon-toggle').checked;
  const errEl = document.getElementById('post-error');
  const btn = document.getElementById('post-submit-btn');
  errEl.classList.remove('show');

  if(!content){
    errEl.textContent = '質問の内容を入力してください';
    errEl.classList.add('show');
    return;
  }

  btn.disabled = true; btn.textContent = '投稿中...';

  // 画像を先にアップロードしてパスを集める（最大2枚）
  const imagePaths = [];
  for(const file of _postImageFiles){
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = (window.CURRENT_UID || 'anon') + '/' + Date.now() + '_' + imagePaths.length + '.' + ext;
    const { error: upErr } = await _supabase.storage.from('question-images').upload(path, file);
    if(upErr){
      btn.disabled = false; btn.textContent = '投稿する';
      errEl.textContent = '画像のアップロードに失敗しました: ' + upErr.message;
      errEl.classList.add('show');
      return;
    }
    imagePaths.push(path);
  }

  const { error } = await _supabase.from('questions').insert({
    user_id: window.CURRENT_UID,
    is_anonymous: isAnon,
    author_name: isAnon ? null : _myName,
    content: content,
    image_paths: imagePaths.length > 0 ? imagePaths : null
  });
  btn.disabled = false; btn.textContent = '投稿する';

  if(error){
    errEl.textContent = '投稿に失敗しました: ' + error.message;
    errEl.classList.add('show');
    return;
  }
  closeModal('post-overlay');
  await loadQuestions();
}

// ---------- ユーティリティ ----------
function escapeHtml(str){
  if(str == null) return '';
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}

function formatRelativeTime(isoString){
  if(!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if(diffMin < 1) return 'たった今';
  if(diffMin < 60) return `${diffMin}分前`;
  if(diffHour < 24) return `${diffHour}時間前`;
  if(diffDay < 7) return `${diffDay}日前`;
  return `${date.getMonth()+1}/${date.getDate()}`;
}
