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

Supabase の無料プランではメールテンプレートの Source（生HTML）編集ができず（カスタムSMTP設定が必要）、デフォルトの `{{ .ConfirmationURL }}` 形式のリンクがそのまま送られてくる。このURLは Supabase がホストする `/auth/v1/verify` エンドポイントを指しており、OTP検証自体は Supabase 側で行われる。`@supabase/ssr` はデフォルトで PKCE フローを使うため（`src/lib/supabase/client.ts` / `server.ts`）、検証成功後は `redirect_to` に指定したURL（`/auth/confirm`）へ `?code=...` パラメータ付きでリダイレクトされる。アプリ側はこの `code` を `exchangeCodeForSession()` に渡してセッションを確立する。

1. ユーザーが `/login` でメールアドレスを入力して送信する。
2. Server Action `sendMagicLink`（`src/app/login/actions.ts`）が `supabase.auth.signInWithOtp()` を呼ぶ。この呼び出し時、PKCEフローの `code_verifier` が Cookie に保存され、`emailRedirectTo: ${NEXT_PUBLIC_SITE_URL}/auth/confirm` を指定してSupabaseがログインリンク付きメールを送信する。
3. ユーザーがメール内のリンク（`{{ .ConfirmationURL }}` = Supabaseホスト型の `/auth/v1/verify?token=...&type=...&redirect_to=...`）をクリックすると、Supabase側でOTPが検証され、`/auth/confirm?code=...` にリダイレクトされる。
4. Route Handler（`src/app/auth/confirm/route.ts`）が `code` を受け取り `supabase.auth.exchangeCodeForSession(code)` を呼ぶ。手順2で保存した `code_verifier` Cookie と突き合わせてセッションが確立し、成功すればトップページへリダイレクトする。
5. 以降のリクエストでは `src/proxy.ts`（Proxy、旧 Middleware）がセッションのトークンリフレッシュを行う。
6. ログアウトは Server Action `signOut`（`src/app/auth/actions.ts`）が `supabase.auth.signOut()` を呼ぶ。

### 制約

- PKCEフローは `code_verifier` を発行時と同じブラウザのCookieに依存するため、**メールリンクを送信時とは別のブラウザ・別端末で開くとログインに失敗する**（Supabase側の既知の制約）。将来的にこの制約が問題になる場合は、カスタムSMTPを設定した上で `token_hash` を使うOTP検証フローへの切り替えを検討する。

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
5. Email Templates の編集は不要（無料プランでは Source 編集ができないため、デフォルトの `{{ .ConfirmationURL }}` のまま使う）。

## 今後の拡張予定（オープンな論点）

- プロジェクト閲覧・作成・支援の各画面実装時に、`getUser()` の判定結果を使ったアクセス制御（リダイレクト or ガード）を各画面に組み込む。
- ソーシャルログイン（Google 等）が必要になった場合は Supabase Auth の Provider 追加で対応可能。
- ユーザープロフィール（表示名・アイコン等）を持たせる場合は Supabase の `auth.users` とは別に `profiles` テーブルを設計する。
