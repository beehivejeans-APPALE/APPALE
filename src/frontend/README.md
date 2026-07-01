# frontend

TypeScript（Next.js, App Router）で構築するフロントエンドアプリケーション。

構成・技術選定の背景は [`docs/00_PROJECT.md`](../../docs/00_PROJECT.md)、認証の仕様は [`docs/01_AUTH.md`](../../docs/01_AUTH.md) を参照。

## セットアップ

```bash
npm install
cp .env.example .env.local  # Supabase の値を設定する（docs/01_AUTH.md 参照）
npm run dev
```

[http://localhost:3000](http://localhost:3000) で確認できる。
