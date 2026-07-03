# 05. 公開ページ

`projects` テーブルの `status`（[`docs/03_DATABASE.md`](03_DATABASE.md) 参照）を使い、生成済みのクラファンページを実際に公開する機能を実装した。`draft`（下書き） → `in_review`（レビュー待ち）への申請UIと、`published`（公開済み）のプロジェクトをログイン不要で閲覧できる公開ページの2つで構成される。

## スコープ・前提

- `in_review` → `published` への変更は今回実装しない。**Supabase側で手動運用**とする（SQL EditorまたはTable Editorで対象プロジェクトの `status` を直接 `published` に書き換える運用を想定）。将来、運営側の承認画面や自動承認フローを設ける場合は別途設計する。
- ステータス遷移はこの2種類のみアプリから発生しうる。
  - `draft` → `in_review`: 本ドキュメントで実装（ユーザー本人の操作）。
  - `in_review` → `published`: 実装対象外（手動運用）。
- [`docs/04_PROJECT_SAVE.md`](04_PROJECT_SAVE.md) と同様、ユーザーごとに「進行中のプロジェクトは1件」という前提を引き継ぐ。

## 画面構成の変更

| パス | 変更内容 |
| --- | --- |
| `src/types/project.ts` | `ProjectState` に `status` を追加。`rowToProjectState()` で `projects` 行の `status` をそのまま渡すように変更。`ProjectPatchBody` に `status?: "in_review"` を追加（クライアントから許可する値をこの1つに限定）。 |
| `src/app/api/project/route.ts` | `PATCH` に、公開申請専用の分岐を追加。他の部分更新（`messages`/`extracted`/`generatedPage`）とは独立して扱う。 |
| `src/app/create/ChatPanel.tsx` | ページ生成後、見出し右側に `status` に応じた表示（申請ボタン／レビュー待ち表示／公開済み表示）を追加。 |
| `src/app/p/[id]/page.tsx` | 新規追加。`status = published` のプロジェクトのみ閲覧できる公開ページ（ログイン不要）。 |

## 公開申請（`draft` → `in_review`）

### UI（`ChatPanel.tsx` の `PublishStatus` コンポーネント）

`generatedPage` が存在する場合（＝ページ生成済み）のみ、見出し右側に `status` に応じて次のいずれかを表示する。

- `draft`: 「公開を申請する」ボタン。押すと `PATCH /api/project` を呼び、成功したら画面上の `status` を `in_review` に変更する。
- `in_review`: 「レビュー待ちです」という静的テキスト（操作不可）。
- `published`: 「公開済みです」というテキストと、公開ページ（`/p/[id]`）への新規タブリンク。

### サーバー側（`/api/project` の `PATCH`）

`status` をボディに含むリクエストは、`messages`/`extracted`/`generatedPage` の部分更新とは別の専用分岐で処理する。

- クライアントから送れる値は `"in_review"` のみ。それ以外の値（`"draft"` や `"published"` を含む）は `400` で拒否する。
- 対象プロジェクトを `id` と `user_id`（ログイン中のユーザー）で取得し、以下のいずれかに該当する場合は `409`（`invalid_status_transition`）を返し、更新を行わない。
  - プロジェクトが存在しない、または本人のものでない
  - 現在の `status` が `draft` ではない（二重申請や `published` からの巻き戻し的な操作を防ぐ）
  - `generated_title` が `null`（＝ページがまだ生成されていない状態での申請を防ぐ）
- 上記チェックを通過した場合のみ、`status` を `in_review` に更新する（更新時も念のため `.eq("status", "draft")` を条件に含め、チェックと実際の更新の間で状態が変わった場合の二重更新を防ぐ）。

## 公開ページ（`/p/[id]`）

- 認証不要（Server Componentで `supabase.auth.getUser()` を呼ばない）。[`docs/03_DATABASE.md`](03_DATABASE.md) で設定済みの「誰でも `published` のプロジェクトは読み取れる」RLSポリシー（`projects_select_published`）により、未ログインでも `anon` ロールとして該当行を取得できる。
- 取得条件は `id` 一致 かつ `status = 'published'`。該当行が無い場合（存在しない・本人以外の非公開プロジェクト・`published` 以外のステータス）はすべて同じ扱いとして `notFound()` を呼び、Next.jsの404ページを表示する。ステータスごとに異なるエラーメッセージは出さない（非公開プロジェクトの存在自体を外部に漏らさないため）。
- 表示内容は、`/create` のプレビュー画面（`PagePreview.tsx`）とほぼ同じ構成（タイトル・キャッチコピー・本文・リターン一覧）。ただし公開ページ用に独立したコンポーネントとして実装しており、`PagePreview.tsx` とはコードを共有していない（「プレビュー中」であることを示す見出しなど、下書きプレビュー特有の要素を含めたくないため）。

## 今後の拡張予定（オープンな論点）

- `in_review` → `published` の承認フローは未実装。件数が増えてきた場合、運営用の承認画面（一覧・承認ボタン）を別途用意する必要がある。
- 公開後に内容を修正したくなった場合（`published` のまま再度ヒアリング・ページ再生成する等）の扱いは未設計。特に「最初からやり直す」ボタンは `status` に関わらず常に押せてしまい、`published`/`in_review` 中のプロジェクトに対して押すと、生成済みページ内容だけが消えて `status` はそのまま残るという不整合な状態になりうる（`status` を `draft` に戻す処理は未実装）。
- 公開ページのSEO対応（`generateMetadata` によるタイトル・OGP設定など）は未実装。
- 複数プロジェクト・一覧表示に対応する場合、公開ページのURL設計（`/p/[id]`）自体は変更不要だが、申請UIの前提（1ユーザー1プロジェクト）は [`docs/04_PROJECT_SAVE.md`](04_PROJECT_SAVE.md) と同様に見直しが必要。
