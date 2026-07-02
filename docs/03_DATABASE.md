# 03. プロジェクトの保存（データベース設計）

Phase 2 では、ヒアリング結果・生成済みページ内容をブラウザの State（React state）にのみ保持しており、リロードすると消えていた（[`docs/02_CREATE_CHAT.md`](02_CREATE_CHAT.md) の「今後の拡張予定」を参照）。この課題を解消するため、Supabase（Postgres）にプロジェクトを保存する `projects` テーブルを設計する。

本ドキュメントは **データベース設計（テーブル定義・RLSポリシー）のみ** を対象とし、アプリ側の保存・読み込み処理の実装は対象外（別途着手する）。

## テーブル設計

`ExtractedFields`（ヒアリングで抽出した4項目）と `GeneratedPageContent`（生成されたページ内容）を1行にまとめて持つ、シンプルな単一テーブル構成とした（[`docs/02_CREATE_CHAT.md`](02_CREATE_CHAT.md) の型定義を参照）。プロジェクトごとに履歴やバージョンを持たせる設計は現時点では過剰と判断し、1プロジェクト＝1行・上書き保存とする。

| カラム | 型 | 説明 |
| --- | --- | --- |
| `id` | `uuid` | 主キー。`gen_random_uuid()` で自動生成。 |
| `user_id` | `uuid` | 作成者。`auth.users(id)` を参照。行削除は `on delete cascade`（ユーザー削除時にプロジェクトも削除）。 |
| `purpose` / `target` / `story` / `reward` | `text` | ヒアリングで抽出した4項目（`ExtractedFields` に対応）。未入力状態はアプリ側と同様に空文字列 `''` をデフォルトとする（`EMPTY_EXTRACTED_FIELDS` に合わせた）。 |
| `generated_title` / `generated_tagline` / `generated_story` | `text` | 生成されたページ内容（`GeneratedPageContent` に対応）。ページ生成前は `null`。 |
| `generated_rewards` | `jsonb` | リターン一覧（`PageReward[]`、`{ title, description }` の配列）。複数項目を持つため `jsonb` で保存。ページ生成前は `null`。 |
| `messages` | `jsonb` | 会話ログ（`ChatMessage[]`、`{ role, content }` の配列）。再訪問時にチャット画面をそのまま復元するために保存する（詳細は [`docs/04_PROJECT_SAVE.md`](04_PROJECT_SAVE.md)）。デフォルトは空配列 `[]`。 |
| `status` | `text` | `draft`（下書き） / `in_review`（レビュー待ち） / `published`（公開済み）のいずれか。`check` 制約で値を制限。デフォルトは `draft`。 |
| `created_at` / `updated_at` | `timestamptz` | 作成日時・更新日時。`updated_at` はトリガーで `UPDATE` の都度自動更新する（後述）。 |

`status` は将来的に選択肢が増える可能性はあるが、現時点では列挙型（`enum`）を新設するほどの複雑さはないと判断し、`text` + `check` 制約というシンプルな形にした。

`messages` 列は当初のテーブル作成時には含まれておらず、アプリ側の自動保存・復元機能（[`docs/04_PROJECT_SAVE.md`](04_PROJECT_SAVE.md)）を実装する際に「会話ログそのものも復元したい」という要件を踏まえて追加した。既存テーブルに対しても安全に追記できるよう、以下のSQLは `alter table ... add column if not exists` を使っている（再実行しても壊れない）。

インデックスは、想定される主なクエリ（自分のプロジェクト一覧取得、公開済みプロジェクトの一覧取得）に合わせて `user_id` と `status`（`published` のみの部分インデックス）に張った。

## RLS（Row Level Security）方針

要件どおり、以下の3パターンをポリシーとして分離した。

1. **本人は自分のプロジェクトを読み書きできる**（`status` を問わない） — `select` / `insert` / `update` / `delete` を `auth.uid() = user_id` で制御。
2. **誰でも `published` のプロジェクトは読み取りだけできる** — `select` のみ、`status = 'published'` で制御。ログイン不要（`anon` ロールにも適用される、将来の公開ページ表示のため）。
3. 上記以外（他人の下書き・レビュー待ちプロジェクトの読み取り、他人のプロジェクトの書き込み全般）はすべて拒否（RLSのデフォルト拒否）。

同一コマンド（例: `select`）に対する複数の permissive ポリシーは自動的に OR 結合されるため、「本人は全ステータス閲覧可」「誰でも公開済みは閲覧可」の2つの `select` ポリシーを両立できる。

`insert` / `update` / `delete` は `to authenticated` を明示し、未ログイン（`anon`）ロールに対してはポリシー評価自体を行わないようにした（`user_id` は `not null` かつ `auth.uid()` は未ログイン時 `null` になるため、`to authenticated` を付けなくても実質的にブロックされるが、意図を明確にするため明示した）。

`delete` は要件文には明記されていないが、「読み書き」に自然に含まれる操作と考え、本人所有のプロジェクトに限定したポリシーを用意した。

### RLSポリシーだけでは不十分だった点（実機検証で判明）

実際にアプリから `/api/project` を呼んだところ、RLSポリシーを設定していても `permission denied for table projects`（Postgresエラーコード `42501`）で失敗する事象が発生した。原因は、RLSポリシーとは別に、Postgresのテーブルレベル権限（`GRANT`）が `authenticated`/`anon` ロールに付与されていなかったこと。Table Editor（GUI）経由でテーブルを作成した場合は自動的に権限が付与されるが、SQL Editorで直接 `create table` した場合はそうならないことがある。RLSは「許可された操作の中でどの行にアクセスできるか」を絞り込む仕組みであり、そもそも操作自体を許可する `GRANT` の代わりにはならない。そのため、SQLに以下を追加した。

```sql
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on public.projects to authenticated;
grant select on public.projects to anon;
```

## SQL

Supabase の SQL Editor で以下をそのまま実行する想定。

```sql
-- gen_random_uuid() が使えない場合に備えて（Postgres 13+ ではコア機能だが念のため）
create extension if not exists pgcrypto;

-- ============================================================
-- テーブル作成
-- ============================================================
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- ヒアリングで抽出した4項目（ExtractedFields に対応）
  purpose text not null default '',
  target text not null default '',
  story text not null default '',
  reward text not null default '',

  -- 生成されたページ内容（GeneratedPageContent に対応、生成前は null）
  generated_title text,
  generated_tagline text,
  generated_story text,
  generated_rewards jsonb,

  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'published')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 会話ログ（ChatMessage[]、{ role, content } の配列）。既存テーブルにも安全に追記できるようif not existsを使う。
alter table public.projects
  add column if not exists messages jsonb not null default '[]'::jsonb;

comment on column public.projects.status is
  'draft = 下書き, in_review = レビュー待ち, published = 公開済み';
comment on column public.projects.generated_rewards is
  'PageReward[]（{ title, description } の配列）を JSON として保存';
comment on column public.projects.messages is
  'ChatMessage[]（{ role, content } の配列）を JSON として保存';

create index if not exists projects_user_id_idx
  on public.projects (user_id);

create index if not exists projects_status_published_idx
  on public.projects (status)
  where status = 'published';

-- ============================================================
-- updated_at 自動更新
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
alter table public.projects enable row level security;

-- RLSポリシーとは別に、Postgresのテーブルレベル権限（GRANT）が必要。
-- これがないと「permission denied for table projects」（42501）でRLS以前にブロックされる。
-- GRANTは冪等（再実行しても安全）。
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on public.projects to authenticated;
grant select on public.projects to anon;

-- 本人は自分のプロジェクトを読み取れる（ステータス問わず）
drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own"
  on public.projects for select
  to authenticated
  using (auth.uid() = user_id);

-- 誰でも公開済みプロジェクトは読み取れる（未ログインでも可）
drop policy if exists "projects_select_published" on public.projects;
create policy "projects_select_published"
  on public.projects for select
  using (status = 'published');

-- 本人は自分のプロジェクトを作成できる
drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
  on public.projects for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 本人は自分のプロジェクトを更新できる
drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own"
  on public.projects for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 本人は自分のプロジェクトを削除できる
drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own"
  on public.projects for delete
  to authenticated
  using (auth.uid() = user_id);
```

## Supabase側で必要な作業

1. Supabase ダッシュボードで対象プロジェクトを開き、左メニューの **SQL Editor** を開く。
2. 上記SQLを貼り付けて実行する（`New query` → 実行）。エラーが出ずに完了すれば成功。テーブル作成済みの環境で再実行した場合も、`create table if not exists` / `alter table ... add column if not exists` / `drop policy if exists` により安全に再実行できる（`messages` 列だけが追加される）。
3. 左メニューの **Table Editor** で `projects` テーブルが作成されていること、カラム構成が意図通りであることを確認する。
4. **Authentication > Policies**（または Table Editor 上の該当テーブルの「RLS」タブ）で、上記5つのポリシー（`projects_select_own` / `projects_select_published` / `projects_insert_own` / `projects_update_own` / `projects_delete_own`）が作成されていることを確認する。
5. 可能であれば、SQL Editor 上で別ユーザーのつもりで簡単な検証を行う（例: 自分のプロジェクトを `insert` → `select` できること、`status` を `published` に更新した行が別セッション・匿名アクセスからも `select` できることなど）。本格的な検証はアプリ側の実装後にあわせて行う想定。

## 今後の拡張予定（オープンな論点）

- アプリ側の保存・読み込み処理（自動保存のタイミング、`/create` からの保存、一覧・詳細画面など）は本ドキュメントの対象外。別途実装する。
- `status` の `draft → in_review → published` の遷移ルール（誰が・いつ・どの操作で変更できるか）は未設計。特に `in_review → published` の変更を本人の `update` 権限だけで許可してよいか（承認フローが必要か）は今後の検討事項。
- `ExtractedFields` のフィールド名（`purpose`/`target`/`story`/`reward`）がテーブルのカラム名にもそのまま登場し、`CLAUDE.md` の「既知の改善候補」に記載した「単一の情報源がない」問題の対象箇所がさらに増えた。将来的な対応が必要になった場合はあわせて見直す。
- 1プロジェクト＝1行の上書き保存のみで、編集履歴・世代管理は持たない。将来的に「生成し直す前の内容に戻したい」といった要望が出た場合は別途設計する。
