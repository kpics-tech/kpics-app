# K-PICS アプリ

K-PICS 部員向けのスマホ用ウェブアプリ（PWA）です。GitHub Pages で公開し、ログインとデータは Supabase が担当します。

- 公開URL: https://kpics-tech.github.io/kpics-app/
- 詳しい引き継ぎ書: 「K-PICSアプリ 引き継ぎ書」（Claude Docs）
- セキュリティ点検報告: 「K-PICSアプリ セキュリティ点検報告」

## 画面（下部の4タブ）

| タブ | ファイル |
|---|---|
| ホーム | index.html / app.js |
| まなぶ | manabu.html（SPL・メディカルラリーの資料もここ） |
| カレンダー | calendar.html / calendar.js |
| チャット | questions.html / questions.js |

アカウント設定は、ホーム左上の丸いアイコン（account.html）から開きます。

その他: technique.html / technique-detail.html（自主練ハンドブック）、shock-pocus-10days.html、presentation-guide.html、reset-password.html、basic.html（準備中）、auth-guard.js、tabbar.js、custom-links.js（未使用）、manifest.json、service-worker.js、assets/。

## 仕組み

- 画面（HTML/JS）は GitHub Pages から配信されます。**リポジトリに置いたものは全世界から見えます。** 合言葉・個人情報・部外秘の資料を置かないでください。
- データ・ログイン・PDF・画像は Supabase にあります（認定アプリ `requirements` と共用）。守っているのは Supabase の RLS・トリガーです。ボタンを隠すだけでは守れません。
- 資料PDFはアプリ内（Supabase の content-pdfs）に置きます。Google ドライブへのリンクはありません。
- 新規登録の合言葉は Supabase の Auth Hook（check_member_passphrase）で確認します。コードには書きません。
- コアメンバー・先生・確認者は、管理者が Supabase の profiles を直接書き換えて設定します。
- supabase-js は jsDelivr から `@supabase/supabase-js@2` で読み込んでいます（バージョン未固定）。**突然動かなくなったらまず疑ってください。**

## 画面を直して公開する

GitHub でファイルを編集し「Commit changes」。1〜数分で反映されます。壊れたら History から戻せます。

## 注意

- `service_role` キーは絶対にコードへ書かない。
- 新しいテーブルは RLS をオンにし、読み取りは `to authenticated`、書き込みは `auth.uid() = user_id` を付ける。
- 分かっていて残している弱点は、引き継ぎ書の「分かっていて残している弱点」を参照。
