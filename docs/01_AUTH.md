# 01. 認証（Phase 1）

APPALE! の認証の土台。Phase 1 では認証機能のみを実装し、プロジェクト閲覧・作成・支援などの画面自体はまだ作らない。

## 使用技術

- [Supabase Auth](https://supabase.com/docs/guides/auth) のマジックリンク方式（パスワードレス、メールアドレスのみ）
- Next.js（App Router） + `@supabase/ssr`
  - ブラウザ用クライアント: `src/lib/supabase/client.ts`
  - サーバー用クライアント（Server Components / Server Actions / Route Handlers）: `src/lib/supabase/server.ts`
  - セッションリフレッシュ用: `src/lib/supabase/proxy.ts`（Next.js 16 以降、旧 `middleware.ts` は `proxy.ts` に名称変更されている。エントリポイントは `src/proxy.ts`）

## アクセス制御方針

| 操作 | ログイン要否 |
| --- | --- |
| プロジェクト閲覧 | 不要 |
| プロジェクト作成 | 必須 |
| 支援（購入） | 必須 |

閲覧・作成・支援の画面自体は Phase 1 の対象外。今回実装したのはログイン/ログアウトと、ログイン状態を判定する仕組みのみ。今後各画面を実装する際は、この判定結果を使ってアクセス制御を行う（例: 作成画面・支援フローの手前でログイン状態を確認し、未ログインならログイン画面へリダイレクト）。

## ログインフロー

1. ユーザーが `/login` でメールアドレスを入力して送信する。
2. Server Action `sendMagicLink`（`src/app/login/actions.ts`）が `supabase.auth.signInWithOtp()` を呼び、Supabase がログインリンク付きのメールを送信する。リダイレクト先は `${NEXT_PUBLIC_SITE_URL}/auth/confirm`。
3. ユーザーがメール内のリンクをクリックすると `/auth/confirm?token_hash=...&type=email` にアクセスされる。Route Handler（`src/app/auth/confirm/route.ts`）が `supabase.auth.verifyOtp()` でトークンを検証し、成功すればセッション用 Cookie を発行してトップページへリダイレクトする。
4. 以降のリクエストでは `src/proxy.ts`（Proxy、旧 Middleware）がセッションのトークンリフレッシュを行う。
5. ログアウトは Server Action `signOut`（`src/app/auth/actions.ts`）が `supabase.auth.signOut()` を呼ぶ。

## ログイン状態の判定

- Server Component（`src/app/page.tsx`）で `supabase.auth.getUser()` を呼び、ユーザーの有無でログイン中/未ログインの表示を切り替えている。
- `getUser()` は毎回 Supabase の Auth サーバーに問い合わせて検証済みのユーザー情報を返す。Cookie の中身だけを見る `getSession()` は認可判定には使わない（クライアントに偽装されうるため）。
- 今後、閲覧不要・作成/支援必須のアクセス制御を実装する際は、この判定結果を各ページ・Server Action の入り口で使う想定。

## 環境変数

`.env.example`（`src/frontend/`）を参照。

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase プロジェクトの Project Settings > API から取得。
- `NEXT_PUBLIC_SITE_URL`: マジックリンクのリダイレクト先を組み立てるためのサイト URL。ローカルは `http://localhost:3000`、本番はデプロイ先の URL に変更する。

## Supabase 側で必要な設定（今後、別途ブラウザで実施）

1. Supabase で新規プロジェクトを作成する。
2. Project Settings > API から `Project URL` と `anon public key` を取得し、`.env.local`（`.env.example` をコピーして作成）に設定する。
3. Authentication > Providers で Email（Magic Link / OTP）が有効になっていることを確認する（デフォルトで有効）。
4. Authentication > URL Configuration で以下を設定する。
   - Site URL: `NEXT_PUBLIC_SITE_URL` と同じ値（本番URLに変更した場合はそちらも追加）
   - Redirect URLs に `{Site URL}/auth/confirm` を追加する
5. Authentication > Email Templates の「Magic Link」テンプレートを、PKCE/OTP 検証用のリンク形式に編集する。
   - リンク先を `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` に変更する（デフォルトテンプレートのままだと `/auth/confirm` に必要なパラメータが渡らない）。

## 今後の拡張予定（オープンな論点）

- プロジェクト閲覧・作成・支援の各画面実装時に、`getUser()` の判定結果を使ったアクセス制御（リダイレクト or ガード）を各画面に組み込む。
- ソーシャルログイン（Google 等）が必要になった場合は Supabase Auth の Provider 追加で対応可能。
- ユーザープロフィール（表示名・アイコン等）を持たせる場合は Supabase の `auth.users` とは別に `profiles` テーブルを設計する。
