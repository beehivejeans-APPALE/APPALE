import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import Link from "next/link";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-4 dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        APPALE!
      </h1>

      {user ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            ログイン中: {user.email}
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-full border border-black/[.08] px-5 py-2 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              ログアウト
            </button>
          </form>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            未ログインです。
          </p>
          <Link
            href="/login"
            className="rounded-full bg-foreground px-5 py-2 text-sm text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            ログイン
          </Link>
        </div>
      )}
    </div>
  );
}
