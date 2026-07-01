"use server";

import { createClient } from "@/lib/supabase/server";

export type SendMagicLinkState = {
  status: "idle" | "sent" | "error";
  message?: string;
};

export async function sendMagicLink(
  _prevState: SendMagicLinkState,
  formData: FormData,
): Promise<SendMagicLinkState> {
  const email = formData.get("email");

  if (typeof email !== "string" || !email) {
    return { status: "error", message: "メールアドレスを入力してください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "sent" };
}
