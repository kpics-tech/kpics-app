// ================================================================
// K-PICS イベントカレンダー ロジック
// ================================================================

// ---------- スプラッシュ（短縮） ----------
setTimeout(()=>{ document.getElementById('splash').classList.add('hide'); }, 550);

// ---------- 認証ガード ----------
// このページに直接来た場合でもログイン状態を確認し、未ログインならホームへ戻す
let CURRENT_UID = null;
let CURRENT_USER_NAME = '';
let CURRENT_IS_CORE = false;

_supabase.auth.onAuthStateChange((event, session)=>{
  if(session && session.user){
    CURRENT_UID = session.user.id;
    _supabase.from('profiles').select('name,is_core_member').eq('id', CURRENT_UID).single().then(({data})=>{
      CURRENT_USER_NAME = data?.name || session.user.email || '';
      CURRENT_IS_CORE = !!data?.is_core_member;
    });
  } else {
    location.href = 'index.html';
  }
});

// ---------- 状態 ----------
const MONTH_NAMES = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
let viewYear, viewMonth; // 0-indexed month
let EVENTS = []; // 全イベント {id,title,event_date,event_time,location,description,created_by,created_by_name}
let selectedDateStr = null;
let currentDetailId = null;
let editingId = null;
let _calBadgeMap = {}; // user_id -> {is_teacher, is_core_member, is_certified}

const today = new Date();
viewYear = today.getFullYear();
viewMonth = today.getMonth();

function pad2(n){ return String(n).padStart(2,'0'); }
function dateStr(y,m,d){ return `${y}-${pad2(m+1)}-${pad2(d)}`; }
function todayStr(){ const t=new Date(); return dateStr(t.getFullYear(),t.getMonth(),t.getDate()); }

// ---------- データ取得 ----------
async function loadEvents(){
  const {data, error} = await _supabase.from('events').select('*').order('event_date',{ascending:true});
  if(error){
    console.error(error);
    document.getElementById('agenda-list').innerHTML = `<div class="empty-state">読み込みに失敗しました<br>${error.message}</div>`;
    return;
  }
  EVENTS = data || [];
  renderCalendar();
  renderAgenda();
}

// ---------- カレンダー描画 ----------
function renderCalendar(){
  document.getElementById('month-label').textContent = `${viewYear} ${MONTH_NAMES[viewMonth]}`;
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
  const tStr = todayStr();

  for(let i=0;i<firstDow;i++){
    const empty = document.createElement('div');
    empty.className = 'cal-cell empty';
    grid.appendChild(empty);
  }

  for(let d=1; d<=daysInMonth; d++){
    const ds = dateStr(viewYear, viewMonth, d);
    const dayEvents = EVENTS.filter(e=>e.event_date===ds);
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if(ds===tStr) cell.classList.add('today');
    if(ds===selectedDateStr) cell.classList.add('selected');
    cell.onclick = ()=>selectDate(ds);

    let inner = `<div class="cal-daynum">${d}</div>`;
    if(dayEvents.length){
      const shown = dayEvents.slice(0,2);
      inner += shown.map(e=>`<div class="cal-evt-mini">${escapeHtml(e.title)}</div>`).join('');
      if(dayEvents.length>2){
        inner += `<div class="cal-evt-mini" style="opacity:.7;">+${dayEvents.length-2}件</div>`;
      }
    }
    cell.innerHTML = inner;
    grid.appendChild(cell);
  }
}

function selectDate(ds){
  selectedDateStr = (selectedDateStr===ds) ? null : ds;
  renderCalendar();
  renderAgenda();
}

function changeMonth(delta){
  viewMonth += delta;
  if(viewMonth<0){ viewMonth=11; viewYear--; }
  if(viewMonth>11){ viewMonth=0; viewYear++; }
  renderCalendar();
}
function goToday(){
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();
  selectedDateStr = todayStr();
  renderCalendar();
  renderAgenda();
}

// ---------- アジェンダ描画 ----------
function renderAgenda(){
  const label = document.getElementById('agenda-label');
  const list = document.getElementById('agenda-list');

  let items;
  if(selectedDateStr){
    label.textContent = formatDateLabel(selectedDateStr) + ' の予定';
    items = EVENTS.filter(e=>e.event_date===selectedDateStr);
  } else {
    label.textContent = '今後の予定';
    const tStr = todayStr();
    items = EVENTS.filter(e=>e.event_date>=tStr).slice(0,20);
  }

  if(!items.length){
    list.innerHTML = `<div class="empty-state">予定はまだありません<br>右下の + ボタンから追加できます</div>`;
    return;
  }

  list.innerHTML = items.map(e=>{
    const d = new Date(e.event_date+'T00:00:00');
    return `
    <div class="evt-card" onclick="openDetail('${e.id}')">
      <div class="evt-date-chip">
        <div class="d">${d.getDate()}</div>
        <div class="m">${MONTH_NAMES[d.getMonth()]}</div>
      </div>
      <div class="evt-body">
        <div class="evt-title">${escapeHtml(e.title)}</div>
        <div class="evt-meta">
          ${e.event_time ? `<div class="evt-meta-item">🕐 ${escapeHtml(e.event_time)}</div>` : ''}
          ${e.location ? `<div class="evt-meta-item">📍 ${escapeHtml(e.location)}</div>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function formatDateLabel(ds){
  const d = new Date(ds+'T00:00:00');
  const dow = ['日','月','火','水','木','金','土'][d.getDay()];
  return `${d.getMonth()+1}/${d.getDate()}（${dow}）`;
}

function escapeHtml(s){
  if(!s) return '';
  return s.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- 詳細モーダル ----------
function openDetail(id){
  const e = EVENTS.find(x=>x.id===id);
  if(!e) return;
  currentDetailId = id;
  document.getElementById('detail-title-h').textContent = e.title;
  const d = new Date(e.event_date+'T00:00:00');
  const dow = ['日','月','火','水','木','金','土'][d.getDay()];
  document.getElementById('detail-body').innerHTML = `
    <div class="detail-meta-row"><span class="ic">📅</span> ${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${dow}）</div>
    ${e.event_time ? `<div class="detail-meta-row"><span class="ic">🕐</span> ${escapeHtml(e.event_time)}</div>` : ''}
    ${e.location ? `<div class="detail-meta-row"><span class="ic">📍</span> ${escapeHtml(e.location)}</div>` : ''}
    ${e.description ? `<div class="detail-desc">${escapeHtml(e.description)}</div>` : ''}
    ${e.created_by_name ? `<div class="detail-created">登録: ${escapeHtml(e.created_by_name)}</div>` : ''}
    <div class="att-section">
      <div class="att-head">
        <div class="att-label">出席</div>
        <div class="att-count" id="att-count-${id}"></div>
      </div>
      <div id="att-action-${id}"></div>
      <div class="att-list" id="att-list-${id}"><div class="att-empty">読み込み中...</div></div>
    </div>
    <div class="imp-section">
      <div class="imp-label">感想・学んだこと</div>
      <div class="imp-list" id="imp-list-${id}">
        <div class="empty-state" style="padding:14px 0;">読み込み中...</div>
      </div>
      <div class="imp-form">
        <div class="imp-input-row">
          <textarea class="imp-input" id="imp-input-${id}" rows="1" placeholder="どんなイベントだったか、学んだことを書いてみよう"></textarea>
          <button class="imp-send" onclick="submitImpression('${id}')" aria-label="送信">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
          </button>
        </div>
        <label class="imp-anon-toggle">
          <input type="checkbox" id="imp-anon-${id}" style="accent-color:var(--orange);">
          匿名で投稿する
        </label>
      </div>
    </div>
  `;
  document.getElementById('detail-overlay').classList.add('open');
  loadImpressions(id);
  loadAttendances(id, e.event_date);
}

// ---------- イベント出席（出席のみ・前日まで受付） ----------
async function loadAttendances(eventId, eventDate){
  const {data, error} = await _supabase
    .from('event_attendances')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', {ascending:true});
  if(error){
    const listEl = document.getElementById('att-list-'+eventId);
    if(listEl) listEl.innerHTML = `<div class="att-empty">出席情報の読み込みに失敗しました</div>`;
    return;
  }
  renderAttendance(eventId, eventDate, data || []);
}

function renderAttendance(eventId, eventDate, rows){
  const countEl  = document.getElementById('att-count-'+eventId);
  const actionEl = document.getElementById('att-action-'+eventId);
  const listEl   = document.getElementById('att-list-'+eventId);
  if(!countEl || !actionEl || !listEl) return;

  const amAttending = rows.some(r => r.user_id === CURRENT_UID);
  const isOpen = todayStr() < eventDate; // 前日まで受付（当日以降は締切）

  countEl.textContent = rows.length ? `${rows.length}人が出席予定` : '';

  if(isOpen){
    actionEl.innerHTML = amAttending
      ? `<button class="att-btn leave" onclick="toggleAttendance('${eventId}','${eventDate}')">出席をとりやめる</button>`
      : `<button class="att-btn join" onclick="toggleAttendance('${eventId}','${eventDate}')">出席する</button>`;
  } else {
    actionEl.innerHTML = `<div class="att-closed">出席の受付は締め切りました（前日まで）${amAttending ? '<span class="att-you">あなたは出席予定です</span>' : ''}</div>`;
  }

  if(rows.length === 0){
    listEl.innerHTML = `<div class="att-empty">まだ出席予定の人はいません</div>`;
  } else {
    listEl.innerHTML = rows.map(r => {
      const you = r.user_id === CURRENT_UID;
      const name = r.user_name || '部員';
      return `<div class="att-chip ${you ? 'you' : ''}">${escapeHtml(name)}${you ? '（あなた）' : ''}</div>`;
    }).join('');
  }
}

async function toggleAttendance(eventId, eventDate){
  if(!CURRENT_UID){ location.href = 'index.html'; return; }
  if(todayStr() >= eventDate){
    alert('出席の受付は締め切られています（前日まで）。');
    await loadAttendances(eventId, eventDate);
    return;
  }
  const {data:existing, error:selErr} = await _supabase
    .from('event_attendances')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', CURRENT_UID)
    .maybeSingle();
  if(selErr){ alert('出席状態の確認に失敗しました: ' + selErr.message); return; }

  if(existing){
    const {error} = await _supabase.from('event_attendances').delete().eq('id', existing.id);
    if(error){ alert('取り消しに失敗しました: ' + error.message); return; }
  } else {
    const {error} = await _supabase.from('event_attendances').insert({
      event_id: eventId,
      user_id: CURRENT_UID,
      user_name: CURRENT_USER_NAME || '部員'
    });
    if(error){ alert('出席登録に失敗しました: ' + error.message); return; }
  }
  await loadAttendances(eventId, eventDate);
}

// ---------- イベントの感想 ----------
async function ensureBadgesCal(userIds){
  const need = [...new Set(userIds)].filter(id => id && !(id in _calBadgeMap));
  if(need.length === 0) return;
  const {data, error} = await _supabase
    .from('profiles')
    .select('id,is_teacher,is_core_member,is_certified')
    .in('id', need);
  if(error){ console.error('バッジ取得エラー', error); return; }
  (data || []).forEach(p => { _calBadgeMap[p.id] = p; });
}

function getImpBadgesHtml(userId, isAnonymous){
  if(isAnonymous) return '';
  const b = _calBadgeMap[userId];
  if(!b) return '';
  let html = '';
  if(b.is_teacher)     html += `<span class="imp-badge b-teacher">先生</span>`;
  if(b.is_core_member) html += `<span class="imp-badge b-core">コア</span>`;
  if(b.is_certified)   html += `<span class="imp-badge b-certified">認定</span>`;
  return html ? `<span class="imp-badges">${html}</span>` : '';
}

async function loadImpressions(eventId){
  const listEl = document.getElementById('imp-list-'+eventId);
  if(!listEl) return;
  const {data, error} = await _supabase
    .from('event_impressions')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', {ascending:true});

  if(error){
    listEl.innerHTML = `<div class="empty-state" style="padding:10px 0;">感想の読み込みに失敗しました</div>`;
    return;
  }
  await ensureBadgesCal((data || []).map(r => r.user_id));
  renderImpressions(eventId, data || []);
}

function renderImpressions(eventId, impressions){
  const listEl = document.getElementById('imp-list-'+eventId);
  if(!listEl) return;
  if(impressions.length === 0){
    listEl.innerHTML = `<div style="font-size:11.5px;color:var(--text-dim);padding:2px 0 4px;">まだ感想・学びの記録はありません</div>`;
    return;
  }
  listEl.innerHTML = impressions.map(imp => {
    const name = imp.is_anonymous ? '匿名' : (imp.author_name || '部員');
    const anonClass = imp.is_anonymous ? 'anon' : '';
    const badgesHtml = getImpBadgesHtml(imp.user_id, imp.is_anonymous);
    const isOwn = imp.user_id === CURRENT_UID;
    const canDel = isOwn || CURRENT_IS_CORE;
    const editBtnHtml = isOwn
      ? `<button class="imp-delete" onclick="startEditImpression('${eventId}','${imp.id}')">編集</button>`
      : '';
    const delBtnHtml = canDel
      ? `<button class="imp-delete" onclick="deleteImpression('${eventId}','${imp.id}')">削除</button>`
      : '';
    return `
      <div class="imp-item" data-imp-id="${imp.id}">
        <div class="imp-head">
          <div class="imp-author ${anonClass}">${escapeHtml(name)}</div>
          ${badgesHtml}
          <div class="imp-time">${formatImpTime(imp.created_at)}</div>
          ${editBtnHtml}
          ${delBtnHtml}
        </div>
        <div class="imp-text" id="imp-text-${imp.id}">${escapeHtml(imp.content)}</div>
      </div>
    `;
  }).join('');
}

// ---------- 感想の編集（自分の感想のみ） ----------
function startEditImpression(eventId, impId){
  const textEl = document.getElementById('imp-text-'+impId);
  if(!textEl) return;
  const currentContent = textEl.textContent;
  textEl.innerHTML = `
    <textarea class="imp-input" id="imp-edit-input-${impId}" rows="2" style="width:100%;margin-bottom:8px;">${escapeHtml(currentContent)}</textarea>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary" style="padding:8px;font-size:12px;" onclick="saveEditImpression('${eventId}','${impId}')">保存する</button>
      <button class="btn-ghost" style="padding:8px 12px;font-size:12px;" onclick="loadImpressions('${eventId}')">キャンセル</button>
    </div>
  `;
}

async function saveEditImpression(eventId, impId){
  const input = document.getElementById('imp-edit-input-'+impId);
  const content = input.value.trim();
  if(!content) return;
  const {error} = await _supabase.from('event_impressions').update({content}).eq('id', impId);
  if(error){ alert('更新に失敗しました: ' + error.message); return; }
  await loadImpressions(eventId);
}

async function submitImpression(eventId){
  const input = document.getElementById('imp-input-'+eventId);
  const anonCheckbox = document.getElementById('imp-anon-'+eventId);
  const content = input.value.trim();
  if(!content) return;

  const isAnon = anonCheckbox.checked;
  const {error} = await _supabase.from('event_impressions').insert({
    event_id: eventId,
    user_id: CURRENT_UID,
    is_anonymous: isAnon,
    author_name: isAnon ? null : CURRENT_USER_NAME,
    content: content
  });

  if(error){
    alert('感想の投稿に失敗しました: ' + error.message);
    return;
  }
  input.value = '';
  await loadImpressions(eventId);
}

async function deleteImpression(eventId, impId){
  if(!confirm('この感想を削除しますか？')) return;
  const {error} = await _supabase.from('event_impressions').delete().eq('id', impId);
  if(error){ alert('削除に失敗しました: ' + error.message); return; }
  await loadImpressions(eventId);
}

function formatImpTime(isoString){
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

function closeModal(id){
  document.getElementById(id).classList.remove('open');
}
function closeOnOverlay(ev, id){
  if(ev.target.id===id) closeModal(id);
}

// ---------- 追加・編集モーダル ----------
function openCreateModal(){
  editingId = null;
  document.getElementById('form-title-h').textContent = 'イベントを追加';
  document.getElementById('f-title').value = '';
  document.getElementById('f-date').value = selectedDateStr || todayStr();
  document.getElementById('f-time').value = '';
  document.getElementById('f-location').value = '';
  document.getElementById('f-desc').value = '';
  document.getElementById('form-error').classList.remove('show');
  document.getElementById('form-submit-btn').textContent = '保存する';
  document.getElementById('form-overlay').classList.add('open');
}

function openEditModal(id){
  const e = EVENTS.find(x=>x.id===id);
  if(!e) return;
  closeModal('detail-overlay');
  editingId = id;
  document.getElementById('form-title-h').textContent = 'イベントを編集';
  document.getElementById('f-title').value = e.title || '';
  document.getElementById('f-date').value = e.event_date || '';
  document.getElementById('f-time').value = e.event_time || '';
  document.getElementById('f-location').value = e.location || '';
  document.getElementById('f-desc').value = e.description || '';
  document.getElementById('form-error').classList.remove('show');
  document.getElementById('form-submit-btn').textContent = '更新する';
  document.getElementById('form-overlay').classList.add('open');
}

async function submitForm(){
  const title = document.getElementById('f-title').value.trim();
  const date = document.getElementById('f-date').value;
  const time = document.getElementById('f-time').value.trim();
  const location = document.getElementById('f-location').value.trim();
  const desc = document.getElementById('f-desc').value.trim();
  const errEl = document.getElementById('form-error');
  const btn = document.getElementById('form-submit-btn');
  errEl.classList.remove('show');

  if(!title || !date){
    errEl.textContent = 'イベント名と日付は必須です';
    errEl.classList.add('show');
    return;
  }

  btn.disabled = true; btn.textContent = '保存中...';

  const payload = {
    title, event_date: date, event_time: time || null,
    location: location || null, description: desc || null,
  };

  let error;
  if(editingId){
    ({error} = await _supabase.from('events').update(payload).eq('id', editingId));
  } else {
    payload.created_by = CURRENT_UID;
    payload.created_by_name = CURRENT_USER_NAME;
    ({error} = await _supabase.from('events').insert(payload));
  }

  btn.disabled = false; btn.textContent = editingId ? '更新する' : '保存する';

  if(error){
    errEl.textContent = '保存に失敗しました: ' + error.message;
    errEl.classList.add('show');
    return;
  }

  closeModal('form-overlay');
  await loadEvents();
}

async function confirmDelete(id){
  if(!confirm('このイベントを削除しますか？この操作は取り消せません。')) return;
  const {error} = await _supabase.from('events').delete().eq('id', id);
  if(error){ alert('削除に失敗しました: '+error.message); return; }
  closeModal('detail-overlay');
  await loadEvents();
}

// ---------- 初期化 ----------
selectedDateStr = null;
loadEvents();
