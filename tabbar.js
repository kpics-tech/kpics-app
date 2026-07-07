// ===================== 下部タブバー：現在地ハイライト =====================
// 4タブ構成（ホーム／まなぶ／カレンダー／その他）。
// 資料・質問はどちらも「その他」タブ配下として扱う。
(function(){
  var fileToTab = {
    'index.html': 'home',
    '': 'home', // ルート直下でindex.htmlが省略された場合
    'manabu.html': 'manabu',
    'calendar.html': 'calendar',
    'other.html': 'other',
    'documents.html': 'other',
    'questions.html': 'other',
    'account.html': 'other',
    'prep.html': 'manabu',
    'prep-detail.html': 'manabu',
    'wiki-detail.html': 'manabu'
  };

  function highlightCurrentTab(){
    var path = window.location.pathname.split('/').pop();
    var currentTab = fileToTab[path];
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

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', highlightCurrentTab);
  } else {
    highlightCurrentTab();
  }
})();
