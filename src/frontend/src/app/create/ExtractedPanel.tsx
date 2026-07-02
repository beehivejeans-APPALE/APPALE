import { isExtractedComplete, type ExtractedFields } from "@/types/chat";

const FIELDS: { key: keyof ExtractedFields; label: string }[] = [
  { key: "purpose", label: "目的" },
  { key: "target", label: "ターゲット" },
  { key: "story", label: "ストーリー" },
  { key: "reward", label: "リターン設計" },
];

export default function ExtractedPanel({
  extracted,
  hasGeneratedPage,
  generating,
  generateError,
  onGenerate,
}: {
  extracted: ExtractedFields;
  hasGeneratedPage: boolean;
  generating: boolean;
  generateError: string | null;
  onGenerate: () => void;
}) {
  const isComplete = isExtractedComplete(extracted);

  return (
    <div className="flex w-full shrink-0 flex-col gap-3 md:w-72">
      {isComplete && (
        <div className="flex flex-col gap-2">
          <div className="rounded-2xl bg-green-100 px-4 py-2 text-center text-sm font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
            ヒアリング完了
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="rounded-full bg-foreground px-4 py-2 text-sm text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {generating
              ? "生成中..."
              : hasGeneratedPage
                ? "ページを再生成する"
                : "ページを生成する"}
          </button>
          {generateError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {generateError}
            </p>
          )}
        </div>
      )}

      {FIELDS.map((field) => {
        const value = extracted[field.key];
        return (
          <div
            key={field.key}
            className="rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-900"
          >
            <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {field.label}
            </h2>
            <p
              className={`mt-1 text-sm whitespace-pre-wrap ${
                value
                  ? "text-black dark:text-zinc-50"
                  : "text-zinc-400 dark:text-zinc-600"
              }`}
            >
              {value || "未入力"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
