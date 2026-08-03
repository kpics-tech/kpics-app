// ================================================================
// K-PICS 認証ガード（資料・質問タブなど、サブページ共通）
// ================================================================
// このスクリプトがやること：
// 1. ログインしているか確認する
// 2. ログインしていなければ、自動的にホーム画面（index.html）に戻す
//    → index.html側でログイン画面が表示される
// 3. ログインしていれば、ページの中身をそのまま表示する
//
// index.html や calendar.html のような「ログイン画面そのものを持つページ」
// では使わない。app.js / calendar.js が別途、同じ役割を担っている。
//
// 【2026-08 修正】
// 以前は onAuthStateChange の発火だけに頼っていたため、通信が不安定で
// イベントが飛んでこないと「未ログインなのに5秒後に中身が表示される」
// ことがあった。今回から getSession() で必ず自分から確認しにいき、
// 判定できなかった場合は表示せずホーム画面に戻すようにしている。

(function(){
  // ページの中身を一旦隠しておき、ログイン確認が終わるまで見えないようにする
  document.documentElement.style.visibility = 'hidden';

  var resolved = false; // ログイン判定が一度でも確定したか

  function goToLogin(){
    if(resolved) return;
    resolved = true;
    window.location.replace('index.html');
  }

  function showPage(session){
    resolved = true;
    // 他のページ（questions.js など）は window.CURRENT_UID を見て
    // 初期化を始めるので、表示より先にセットしておく
    window.CURRENT_UID = session.user.id;
    document.documentElement.style.visibility = 'visible';
  }

  // ---- 1. 起動時に自分から現在のログイン状態を確認する ----
  _supabase.auth.getSession().then(function(res){
    var session = res && res.data ? res.data.session : null;
    if(session && session.user){
      showPage(session);
    } else {
      goToLogin();
    }
  }).catch(function(){
    goToLogin();
  });

  // ---- 2. 表示中にログアウトされた場合は、その時点で追い出す ----
  _supabase.auth.onAuthStateChange(function(event, session){
    if(session && session.user){
      // まだ確認中だった場合はここで確定させる（従来どおりの動き）
      if(!resolved) showPage(session);
      else window.CURRENT_UID = session.user.id;
    } else if(event === 'SIGNED_OUT'){
      window.CURRENT_UID = null;
      window.location.replace('index.html');
    }
  });

  // ---- 3. 保険：8秒経っても判定できなければ、表示せずホームに戻す ----
  // （通信トラブル時に中身が見えてしまうのを防ぐ。ログイン済みなら
  //   ホーム画面がそのままホームを表示するので、実害はない）
  setTimeout(goToLogin, 8000);
})();
