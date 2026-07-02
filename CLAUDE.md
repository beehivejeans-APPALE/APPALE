# CLAUDE.md

APPALE! リポジトリで作業する際の方針。

## プロジェクト概要

日本語の対話だけで、世界に向けたクラウドファンディングページを完成できるAIプラットフォーム。
詳細なビジョン・想定機能は [`docs/00_PROJECT.md`](docs/00_PROJECT.md) を参照。Phase 1 として認証機能の実装に着手済み（詳細は [`docs/01_AUTH.md`](docs/01_AUTH.md)）。Phase 2 として、企画をヒアリングするチャット画面、会話からの構造化データ抽出・サイドパネル表示、およびヒアリング完了後のクラファンページ文章生成・プレビュー表示を実装済み（詳細は [`docs/02_CREATE_CHAT.md`](docs/02_CREATE_CHAT.md)）。Supabaseへのプロジェクト保存テーブル（`projects`）とRLS設定（[`docs/03_DATABASE.md`](docs/03_DATABASE.md)）、および会話・抽出データ・生成済みページの自動保存・復元（[`docs/04_PROJECT_SAVE.md`](docs/04_PROJECT_SAVE.md)）も実装済み。ステータス（下書き/レビュー待ち/公開済み）の切り替えUIと、公開ページとしての表示はまだ未実装。

## 構成

- `docs/` — 設計・仕様ドキュメント。新しい設計判断はここに追記する。
- `src/frontend/` — TypeScript（Next.js, App Router）フロントエンド。Supabase Auth（マジックリンク）による認証の土台と、Gemini API（`@google/genai`）を使った企画ヒアリングチャット（`/create`）を実装済み。
- `src/backend/` — Python バックエンド（未実装）

## 開発方針

- コミュニケーション・ドキュメントは日本語を基本とする。
- 実装に着手する前に、対象範囲を `docs/00_PROJECT.md` の各セクション（Mission, Vision, Why, Concept, Core UX Flow, APPALE!の本質, Target Users, Differentiation, Goal, Note）と照らし合わせ、矛盾があれば先にドキュメントを更新してから着手する。
- 技術スタックやリポジトリ構成に変更が生じた場合は、`docs/00_PROJECT.md` と本ファイルの両方を更新する。
- 過剰な抽象化・将来を見越した設計を避け、現時点で必要な範囲に絞って実装する。

## 既知の改善候補（未対応）

- `ExtractedFields`（purpose/target/story/reward の4項目）のフィールド名が `src/frontend/src/app/create/ExtractedPanel.tsx`・`src/frontend/src/app/api/chat/route.ts`・`src/frontend/src/app/create/ChatPanel.tsx`・`src/frontend/src/app/api/generate-page/route.ts`・`src/frontend/src/app/api/project/route.ts`（DBカラムへのマッピング）の5箇所に個別にハードコードされており、単一の情報源がない。将来項目を追加する際、一部の箇所だけ更新し忘れるリスクがある（なお「4項目すべて埋まっているか」の判定ロジック自体は `isExtractedComplete`（`src/frontend/src/types/chat.ts`）として共通化済み）。
- ユーザーごとに「進行中のプロジェクトは1件」という前提で自動保存・復元を実装しており（`src/frontend/src/app/api/project/route.ts`）、プロジェクト一覧・新規作成UIは未実装。複数プロジェクトを持てるようにする場合は設計の見直しが必要（詳細は [`docs/04_PROJECT_SAVE.md`](docs/04_PROJECT_SAVE.md)）。
- `src/frontend/src/app/api/chat/route.ts` と `src/frontend/src/app/api/generate-page/route.ts` で、Gemini APIが構造化出力のスキーマに反する不正な形式（例: JSON文字列 `"null"` など）を返した場合、エラー分類が粗く、本来 `invalid_model_response` になるべきケースが汎用的な `gemini_error` として記録されることがある。
