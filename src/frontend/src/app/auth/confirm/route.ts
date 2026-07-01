import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

// Supabase の無料プランではメールテンプレートの Source 編集（{{ .TokenHash }} への変更）ができないため、
// デフォルトの {{ .ConfirmationURL }} 経由でリダイレクトされる前提で実装する。
// このURLは一度 Supabase 側のホスト型 /auth/v1/verify でOTP検証され、
// PKCEフロー（@supabase/ssr のデフォルト）のため `code` パラメータ付きでこのルートに戻ってくる。
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      redirect(next);
    }
  }

  redirect("/login?error=auth");
}
