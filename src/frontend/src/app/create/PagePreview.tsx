import type { GeneratedPageContent } from "@/types/chat";

export default function PagePreview({ page }: { page: GeneratedPageContent }) {
  return (
    <div className="flex-1 overflow-y-auto md:min-h-0">
      <div className="mx-auto max-w-2xl rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
        <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          プレビュー（まだ保存・公開はされていません）
        </h2>

        <h1 className="mt-2 text-2xl font-bold text-black dark:text-zinc-50">
          {page.title}
        </h1>
        <p className="mt-2 text-base text-zinc-600 dark:text-zinc-300">
          {page.tagline}
        </p>

        <div className="mt-6 space-y-4 text-sm leading-relaxed whitespace-pre-wrap text-black dark:text-zinc-50">
          {page.story}
        </div>

        <div className="mt-8">
          <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
            リターン
          </h3>
          <ul className="mt-3 space-y-3">
            {page.rewards.map((reward, index) => (
              <li
                key={index}
                className="rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]"
              >
                <p className="text-sm font-medium text-black dark:text-zinc-50">
                  {reward.title}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {reward.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
