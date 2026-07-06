-- ================================================================
-- アカウント設定（名前・学年の変更）用：profiles 更新ポリシー
-- ----------------------------------------------------------------
-- account.html で「保存に失敗しました（... permission ...）」のような
-- エラーが出る場合のみ、Supabase ダッシュボード → SQL Editor で
-- 以下を実行してください。既に更新できている場合は実行不要です。
--
-- 内容：ログイン中の本人が、自分の profiles 行だけを更新できるようにする。
-- （他人のプロフィールは変更できません）
-- ================================================================

alter table public.profiles enable row level security;

drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
