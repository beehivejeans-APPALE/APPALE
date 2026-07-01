"use client";

import { useActionState } from "react";
import { sendMagicLink, type SendMagicLinkState } from "./actions";

const initialState: SendMagicLinkState = { status: "idle" };

export default function LoginPage() {
  const [state, action, pending] = useActionState(
    sendMagicLink,
    initialState,
  );

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          ログイン
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          メールアドレスを入力すると、ログイン用のリンクが届きます。
        </p>

        <form action={action} className="mt-6 flex flex-col gap-4">
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            className="rounded-lg border border-black/[.08] bg-transparent px-4 py-2 text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-foreground px-5 py-2 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {pending ? "送信中..." : "ログインリンクを送信"}
          </button>
        </form>

        {state.status === "sent" && (
          <p className="mt-4 text-sm text-green-600 dark:text-green-400">
            メールを送信しました。届いたリンクからログインしてください。
          </p>
        )}
        {state.status === "error" && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            {state.message}
          </p>
        )}
      </div>
    </div>
  );
}
