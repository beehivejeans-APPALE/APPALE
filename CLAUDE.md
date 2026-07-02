# CLAUDE.md

APPALE! リポジトリで作業する際の方針。

## プロジェクト概要

日本語の対話だけで、世界に向けたクラウドファンディングページを完成できるAIプラットフォーム。
詳細なビジョン・想定機能は [`docs/00_PROJECT.md`](docs/00_PROJECT.md) を参照。Phase 1 として認証機能の実装に着手済み（詳細は [`docs/01_AUTH.md`](docs/01_AUTH.md)）。Phase 2 として、企画をヒアリングするチャット画面の実装に着手済み（詳細は [`docs/02_CREATE_CHAT.md`](docs/02_CREATE_CHAT.md)）。会話からの構造化データ抽出・クラファンページ生成はまだ未実装。

## 構成

- `docs/` — 設計・仕様ドキュメント。新しい設計判断はここに追記する。
- `src/frontend/` — TypeScript（Next.js, App Router）フロントエンド。Supabase Auth（マジックリンク）による認証の土台と、Gemini API（`@google/genai`）を使った企画ヒアリングチャット（`/create`）を実装済み。
- `src/backend/` — Python バックエンド（未実装）

## 開発方針

- コミュニケーション・ドキュメントは日本語を基本とする。
- 実装に着手する前に、対象範囲を `docs/00_PROJECT.md` の各セクション（Mission, Vision, Why, Concept, Core UX Flow, APPALE!の本質, Target Users, Differentiation, Goal, Note）と照らし合わせ、矛盾があれば先にドキュメントを更新してから着手する。
- 技術スタックやリポジトリ構成に変更が生じた場合は、`docs/00_PROJECT.md` と本ファイルの両方を更新する。
- 過剰な抽象化・将来を見越した設計を避け、現時点で必要な範囲に絞って実装する。
