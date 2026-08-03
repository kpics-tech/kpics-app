// ================================================================
// K-PICS ホームアプリ ロジック
// ================================================================
const REVIEWER_INVITE_CODE = 'KPICS-REVIEWER-2026';
const MEMBER_PASSPHRASE = 'Learn-Lead-Serve';

// ---------- スプラッシュ ----------
const SPLASH_MIN_MS = 1200;
const _splashStart = Date.now();
function hideSplash(){
  const elapsed = Date.now() - _splashStart;
  const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
  setTimeout(()=>{
    document.getElementById('splash').classList.add('hide');
  }, wait);
}

// ---------- 認証タブ切り替え ----------
function switchAuthTab(tab){
  document.getElementById('form-login').style.display  = tab==='login'  ? 'block':'none';
  document.getElementById('form-signup').style.display = tab==='signup' ? 'block':'none';
  document.getElementById('form-forgot').style.display = 'none';
  document.getElementById('tab-login').classList.toggle('active', tab==='login');
  document.getElementById('tab-signup').classList.toggle('active', tab==='signup');
  document.getElementById('login-error').classList.remove('show');
  document.getElementById('signup-error').classList.remove('show');
  const okEl = document.getElementById('signup-success');
  if(okEl) okEl.classList.remove('show');
}

// ---------- パスワードをお忘れの方 ----------
function showForgotForm(){
  document.getElementById('form-login').style.display = 'none';
  document.getElementById('form-signup').style.display = 'none';
  document.getElementById('form-forgot').style.display = 'block';
  document.getElementById('forgot-error').classList.remove('show');
  document.getElementById('forgot-success').classList.remove('show');
}
function hideForgotForm(){
  document.getElementById('form-forgot').style.display = 'none';
  switchAuthTab('login');
}
async function doForgotPassword(){
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  const okEl  = document.getElementById('forgot-success');
  const btn   = document.getElementById('forgot-btn');
  errEl.classList.remove('show');
  okEl.classList.remove('show');
  if(!email){ errEl.textContent='メールアドレスを入力してください'; errEl.classList.add('show'); return; }
  btn.disabled = true; btn.textContent = '送信中...';
  const redirectTo = new URL('reset-password.html', window.location.href).href;
  const {error} = await _supabase.auth.resetPasswordForEmail(email, {redirectTo});
  btn.disabled = false; btn.textContent = '再設定メールを送る';
  if(error){
    errEl.textContent = '送信に失敗しました: ' + error.message;
    errEl.classList.add('show');
    return;
  }
  okEl.textContent = 'メールを送信しました。届いたメール内のリンクから新しいパスワードを設定してください。（迷惑メールフォルダもご確認ください）';
  okEl.classList.add('show');
}

// ---------- ログイン ----------
async function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  const password=document.getElementById('login-password').value;
  const errEl=document.getElementById('login-error');
  const btn=document.getElementById('login-btn');
  errEl.classList.remove('show');
  if(!email||!password){ errEl.textContent='メールアドレスとパスワードを入力してください'; errEl.classList.add('show'); return; }
  btn.disabled=true; btn.textContent='ログイン中...';
  const {error}=await _supabase.auth.signInWithPassword({email,password});
  btn.disabled=false; btn.textContent='ログイン';
  if(error){ errEl.textContent='メールアドレスまたはパスワードが間違っています'; errEl.classList.add('show'); }
}

// ---------- 新規登録 ----------
async function doSignup(){
  const name=document.getElementById('signup-name').value.trim();
  const year=parseInt(document.getElementById('signup-year').value);
  const email=document.getElementById('signup-email').value.trim();
  const password=document.getElementById('signup-password').value;
  const passphrase=document.getElementById('signup-passphrase').value.trim();
  const invite=document.getElementById('signup-invite').value.trim();
  const errEl=document.getElementById('signup-error');
  const btn=document.getElementById('signup-btn');
  errEl.classList.remove('show');
  if(!name||!email||!password||!passphrase){ errEl.textContent='名前・メールアドレス・パスワード・部活の合言葉は必須です'; errEl.classList.add('show'); return; }
  if(password.length<6){ errEl.textContent='パスワードは6文字以上にしてください'; errEl.classList.add('show'); return; }
  if(passphrase!==MEMBER_PASSPHRASE){ errEl.textContent='部活の合言葉が正しくありません。部員に確認してください'; errEl.classList.add('show'); return; }
  if(invite&&invite!==REVIEWER_INVITE_CODE){ errEl.textContent='招待コードが正しくありません'; errEl.classList.add('show'); return; }
  const role=(invite===REVIEWER_INVITE_CODE)?'reviewer':'member';
  btn.disabled=true; btn.textContent='登録中...';
  const {data,error}=await _supabase.auth.signUp({email,password});
  if(error){ btn.disabled=false; btn.textContent='登録する'; errEl.textContent='登録に失敗しました: '+error.message; errEl.classList.add('show'); return; }

  // メール確認が必要な設定の場合、この時点ではまだログイン状態にならない。
  // その場合プロフィール保存も通らないため、確認メールの案内だけ出して終える。
  if(!data.session){
    btn.disabled=false; btn.textContent='登録する';
    showSignupSuccess('確認メールを送信しました。メール内のリンクを開いてから、ログインしてください。（迷惑メールフォルダもご確認ください）');
    return;
  }

  const uid=data.user.id;
  let pErr=null;
  for(let attempt=0;attempt<3;attempt++){
    if(attempt>0) await new Promise(r=>setTimeout(r,800));
    const {error:e}=await _supabase.from('profiles').upsert({id:uid,name,year:isNaN(year)?null:year,role},{onConflict:'id'});
    pErr=e;
    if(!pErr) break;
  }
  btn.disabled=false; btn.textContent='登録する';
  if(pErr){
    errEl.textContent=`プロフィール保存に失敗しました（${pErr.message}）。管理者に連絡してください。`;
    errEl.classList.add('show');
    return;
  }
  showSignupSuccess(`登録が完了しました。ようこそ、${name} さん。`);
}

// ---------- 新規登録の成功メッセージ ----------
// index.html を書き換えなくて済むよう、表示欄はここで動的に作る
// （既存の .auth-success スタイルをそのまま使う）
function showSignupSuccess(message){
  const errEl = document.getElementById('signup-error');
  if(!errEl) return;
  let okEl = document.getElementById('signup-success');
  if(!okEl){
    okEl = document.createElement('div');
    okEl.id = 'signup-success';
    okEl.className = 'auth-success';
    errEl.insertAdjacentElement('afterend', okEl);
  }
  errEl.classList.remove('show');
  okEl.textContent = message;
  okEl.classList.add('show');
}

// ---------- ログアウト ----------
async function doLogout(){
  await _supabase.auth.signOut();
  location.reload();
}

// ---------- 30分無操作で自動ログアウト ----------
let _idleTimer;
function resetIdleTimer(){
  clearTimeout(_idleTimer);
  _idleTimer=setTimeout(async()=>{
    await _supabase.auth.signOut();
    alert('30分間操作がなかったため、自動ログアウトしました。');
    location.reload();
  }, 30*60*1000);
}
['click','keydown','touchstart','scroll'].forEach(ev=>
  document.addEventListener(ev, resetIdleTimer, {passive:true})
);
resetIdleTimer();

// ---------- 認証状態の監視 ----------
window.CURRENT_UID  = null;
window.CURRENT_ROLE = 'member';

let _authResolved = false; // ログイン状態の判定が一度でも完了したか

async function applySessionState(session){
  _authResolved = true;
  if(session && session.user){
    const user = session.user;
    const {data:profile} = await _supabase.from('profiles').select('*').eq('id', user.id).single();
    const role = profile?.role || 'member';
    const name = profile?.name || user.email;
    const year = profile?.year || '';
    window.CURRENT_UID  = user.id;
    window.CURRENT_ROLE = role;
    window.CURRENT_PROFILE = profile || null; // お知らせの投稿権限判定に使う

    document.getElementById('auth-screen').classList.remove('active');

    const avatarEl = document.getElementById('greet-avatar');
    const nameEl   = document.getElementById('greet-name');
    const subEl    = document.getElementById('greet-sub');
    if(avatarEl) avatarEl.textContent = name ? name[0] : '−';
    if(nameEl)   nameEl.textContent = name ? `こんにちは、${name} さん` : 'こんにちは';
    if(subEl)    subEl.textContent = `${year ? year+'年生 ・ ' : ''}${role==='reviewer' ? '確認者' : '部員'}`;

    document.getElementById('home-screen').classList.add('active');
    hideSplash();
    showInstallBannerIfNeeded();
    refreshAnnouncementBadge();
  } else {
    window.CURRENT_UID = null;
    document.getElementById('home-screen').classList.remove('active');
    document.getElementById('auth-screen').classList.add('active');
    hideSplash();
  }
}

// 起動時に一度、現在のログイン状態を直接確認する。
// （onAuthStateChangeの発火だけに頼ると、通信が遅い時に画面の判定が
//   いつまでも終わらず「真っ黒」になることがあるため、明示的に確認する）
_supabase.auth.getSession().then(({data:{session}})=>{
  applySessionState(session);
});

// ログイン・ログアウトなど、状態が変化した時の処理
_supabase.auth.onAuthStateChange((event, session) => {
  applySessionState(session);
});

// 最終保険：4秒経っても上記の判定が一度も完了していない場合は、
// 通信トラブル等が起きているとみなし、ひとまずログイン画面を表示する
// （本当はログイン済みだった場合は、判定が完了した時点で自動的にホーム画面に切り替わる）
setTimeout(()=>{
  hideSplash();
  if(!_authResolved){
    document.getElementById('auth-screen').classList.add('active');
  }
}, 4000);

// ---------- キーボード操作への対応 ----------
// role="button" tabindex="0" を付けた <div>（メニューカードなど）は、
// そのままだとキーボードのEnter／スペースで押せない。
// フォーカス中の要素がその形なら、クリックと同じ動きをさせる。
document.addEventListener('keydown', function(ev){
  if(ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
  const el = document.activeElement;
  if(!el || el.getAttribute('role') !== 'button') return;
  // 本物のボタン・リンク・入力欄はブラウザ標準の動作に任せる
  if(['BUTTON','A','INPUT','TEXTAREA','SELECT'].includes(el.tagName)) return;
  ev.preventDefault();
  el.click();
});

// ---------- PWA: ホーム画面に追加した時に正しく動くようにする ----------
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('service-worker.js').catch(()=>{});
  });
}

// ---------- ホーム画面に追加の案内バナー ----------
function isRunningStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function getDeviceType(){
  const ua = navigator.userAgent;
  if(/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if(/Android/.test(ua)) return 'android';
  return null;
}
function showInstallBannerIfNeeded(){
  if(isRunningStandalone()) return; // すでにアプリとして開いている場合は表示しない
  if(localStorage.getItem('kpics_install_banner_dismissed')==='1') return;
  if(!getDeviceType()) return; // パソコンでは表示しない
  document.getElementById('install-banner').style.display = 'flex';
}
function dismissInstallBanner(){
  document.getElementById('install-banner').style.display = 'none';
  localStorage.setItem('kpics_install_banner_dismissed', '1');
}
function openInstallGuide(){
  const device = getDeviceType() || 'ios';
  document.getElementById('guide-overlay-'+device).classList.add('open');
}
function closeGuide(id){
  document.getElementById(id).classList.remove('open');
}
function closeGuideOnOverlay(ev, id){
  if(ev.target.id===id) closeGuide(id);
}

// ---------- お知らせ機能 ----------
let _announcementsCache = [];

function canPostAnnouncement(){
  const p = window.CURRENT_PROFILE;
  return !!(p && (p.is_core_member || p.is_teacher));
}

// 未読件数を数えてベルにバッジを出す（ホーム画面に入るたびに呼ばれる）
async function refreshAnnouncementBadge(){
  const badgeEl = document.getElementById('announcement-badge');
  if(!badgeEl || !window.CURRENT_UID) return;

  const lastRead = window.CURRENT_PROFILE?.last_announcement_read_at || '1970-01-01T00:00:00Z';
  const {count, error} = await _supabase
    .from('announcements')
    .select('id', {count:'exact', head:true})
    .gt('created_at', lastRead);

  if(error){ console.error('お知らせ件数の取得に失敗', error); return; }
  if(count && count > 0){
    badgeEl.textContent = count > 9 ? '9+' : String(count);
    badgeEl.style.display = 'flex';
  } else {
    badgeEl.style.display = 'none';
  }
}

async function openAnnouncementModal(){
  document.getElementById('announcement-modal-overlay').classList.add('open');
  document.getElementById('announce-post-box').style.display = canPostAnnouncement() ? 'block' : 'none';
  await loadAnnouncements();
  await markAnnouncementsRead();
}
function closeAnnouncementModal(){
  document.getElementById('announcement-modal-overlay').classList.remove('open');
}
function closeAnnouncementModalOnOverlay(ev){
  if(ev.target.id === 'announcement-modal-overlay') closeAnnouncementModal();
}

async function loadAnnouncements(){
  const listEl = document.getElementById('announcement-list');
  const {data, error} = await _supabase
    .from('announcements')
    .select('*')
    .order('created_at', {ascending:false})
    .limit(30);

  if(error){
    listEl.innerHTML = `<div class="announce-empty">読み込みに失敗しました</div>`;
    return;
  }
  _announcementsCache = data || [];
  renderAnnouncements();
}

function renderAnnouncements(){
  const listEl = document.getElementById('announcement-list');
  if(_announcementsCache.length === 0){
    listEl.innerHTML = `<div class="announce-empty">まだお知らせはありません</div>`;
    return;
  }
  listEl.innerHTML = _announcementsCache.map(a => {
    const canDelete = a.author_id === window.CURRENT_UID || (window.CURRENT_PROFILE && window.CURRENT_PROFILE.is_core_member);
    const delBtn = canDelete
      ? `<button class="announce-item-del" onclick="deleteAnnouncement('${a.id}')">削除</button>`
      : '';
    return `
      <div class="announce-item">
        <div class="announce-item-head">
          <div class="announce-item-author">${escapeHtmlApp(a.author_name || '不明')}</div>
          <div class="announce-item-time">${formatAnnounceTime(a.created_at)}</div>
        </div>
        <div class="announce-item-content">${escapeHtmlApp(a.content)}</div>
        ${delBtn}
      </div>
    `;
  }).join('');
}

async function submitAnnouncement(){
  const contentEl = document.getElementById('announce-post-content');
  const errEl = document.getElementById('announce-post-error');
  const btn = document.getElementById('announce-post-btn');
  const content = contentEl.value.trim();
  errEl.classList.remove('show');

  if(!content){
    errEl.textContent = '内容を入力してください';
    errEl.classList.add('show');
    return;
  }

  btn.disabled = true; btn.textContent = '投稿中...';
  const {error} = await _supabase.from('announcements').insert({
    author_id: window.CURRENT_UID,
    author_name: window.CURRENT_PROFILE?.name || 'コアメンバー',
    content: content
  });
  btn.disabled = false; btn.textContent = '投稿する';

  if(error){
    errEl.textContent = '投稿に失敗しました: ' + error.message;
    errEl.classList.add('show');
    return;
  }
  contentEl.value = '';
  await loadAnnouncements();
}

async function deleteAnnouncement(id){
  if(!confirm('このお知らせを削除しますか？')) return;
  const {error} = await _supabase.from('announcements').delete().eq('id', id);
  if(error){ alert('削除に失敗しました: ' + error.message); return; }
  await loadAnnouncements();
}

// モーダルを開いた時点で「最後に読んだ日時」を今に更新する（未読バッジをリセット）
async function markAnnouncementsRead(){
  if(!window.CURRENT_UID) return;
  const now = new Date().toISOString();
  const {error} = await _supabase.from('profiles').update({last_announcement_read_at: now}).eq('id', window.CURRENT_UID);
  if(!error){
    if(window.CURRENT_PROFILE) window.CURRENT_PROFILE.last_announcement_read_at = now;
    const badgeEl = document.getElementById('announcement-badge');
    if(badgeEl) badgeEl.style.display = 'none';
  }
}

function escapeHtmlApp(str){
  if(str == null) return '';
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;');
}
function formatAnnounceTime(isoString){
  const d = new Date(isoString);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
