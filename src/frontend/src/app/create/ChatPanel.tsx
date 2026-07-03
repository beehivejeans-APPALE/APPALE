"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  EMPTY_EXTRACTED_FIELDS,
  type ChatApiResponse,
  type ChatMessage,
  type ExtractedFields,
  type GeneratedPageContent,
  type GeneratePageApiResponse,
} from "@/types/chat";
import type {
  GetOrCreateProjectApiResponse,
  ProjectPatchBody,
  ProjectStatus,
} from "@/types/project";
import ExtractedPanel from "./ExtractedPanel";
import PagePreview from "./PagePreview";

const INITIAL_MESSAGE: ChatMessage = {
  role: "model",
  content:
    "こんにちは！クラウドファンディングの企画について、一緒に整理していきましょう。まずは、今回のプロジェクトでどんなことを実現したいか教えてください。",
};

// 抽出データ・会話ログの自動保存デバウンス時間（ms）。入力がこの時間止まったら保存する。
const AUTOSAVE_DEBOUNCE_MS = 1500;

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [extracted, setExtracted] = useState<ExtractedFields>(
    EMPTY_EXTRACTED_FIELDS,
  );
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPage, setGeneratedPage] =
    useState<GeneratedPageContent | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>("draft");
  const [requestingReview, setRequestingReview] = useState(false);
  const [requestReviewError, setRequestReviewError] = useState<string | null>(
    null,
  );
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初回表示時、ユーザーの既存プロジェクトを読み込む（なければサーバー側で新規作成される）。
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/project", { method: "POST" });
        if (!res.ok) throw new Error("failed to load project");

        const data = (await res.json()) as GetOrCreateProjectApiResponse;
        if (cancelled) return;

        setProjectId(data.project.id);
        setMessages(
          data.project.messages.length > 0
            ? data.project.messages
            : [INITIAL_MESSAGE],
        );
        setExtracted(data.project.extracted);
        setGeneratedPage(data.project.generatedPage);
        setStatus(data.project.status);
        setSaveStatus("saved");
        setLoaded(true);
      } catch (err) {
        console.error("Failed to load project:", err);
        if (!cancelled) {
          setLoadError(
            "プロジェクトの読み込みに失敗しました。ページを再読み込みしてください。",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  async function performSave(
    id: string,
    partial: Omit<ProjectPatchBody, "id">,
  ) {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...partial } satisfies ProjectPatchBody),
      });
      if (!res.ok) throw new Error("failed to save project");
      setSaveStatus("saved");
    } catch (err) {
      console.error("Failed to save project:", err);
      setSaveStatus("error");
    }
  }

  // 変更が1〜2秒止まったら保存する（ヒアリング内容の自動保存用）。
  function scheduleSave(partial: Omit<ProjectPatchBody, "id">) {
    if (!projectId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      performSave(projectId, partial);
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  // デバウンスせず即座に保存する（ページ生成結果、リセットなど明示的な操作の直後に使う）。
  function saveImmediately(partial: Omit<ProjectPatchBody, "id">) {
    if (!projectId) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    performSave(projectId, partial);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;

    // IME変換確定のためのEnterは送信として扱わない。
    // isComposingがブラウザによって正しく立たないケースがあるため、
    // 旧来のkeyCode 229（IME入力中を示す値）も合わせてチェックする。
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    event.preventDefault();
    formRef.current?.requestSubmit();
  }

  function handleReset() {
    // 送信中のリクエストがあれば中断し、後から届く古い応答が
    // リセット後の状態を上書きしてしまわないようにする。
    abortControllerRef.current?.abort();
    setMessages([INITIAL_MESSAGE]);
    setExtracted(EMPTY_EXTRACTED_FIELDS);
    setInput("");
    setError(null);
    setGeneratedPage(null);
    setGenerating(false);
    setGenerateError(null);
    setShowPreview(false);
    saveImmediately({
      messages: [],
      extracted: EMPTY_EXTRACTED_FIELDS,
      generatedPage: null,
    });
  }

  async function handleGeneratePage() {
    if (generating) return;

    setGenerating(true);
    setGenerateError(null);

    try {
      const res = await fetch("/api/generate-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extracted }),
      });

      if (res.status === 429) {
        throw new Error(
          "現在アクセスが集中しています。少し時間をおいてから、もう一度お試しください。",
        );
      }

      if (!res.ok) {
        throw new Error("ページの生成に失敗しました。");
      }

      const data = (await res.json()) as GeneratePageApiResponse;
      setGeneratedPage(data.page);
      setShowPreview(true);
      saveImmediately({ generatedPage: data.page });
    } catch (err) {
      setGenerateError(
        err instanceof Error
          ? err.message
          : "ページの生成に失敗しました。もう一度お試しください。",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleRequestReview() {
    if (!projectId || requestingReview) return;

    setRequestingReview(true);
    setRequestReviewError(null);

    try {
      const res = await fetch("/api/project", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: projectId,
          status: "in_review",
        } satisfies ProjectPatchBody),
      });

      if (!res.ok) throw new Error("公開の申請に失敗しました。");

      setStatus("in_review");
    } catch (err) {
      setRequestReviewError(
        err instanceof Error
          ? err.message
          : "公開の申請に失敗しました。もう一度お試しください。",
      );
    } finally {
      setRequestingReview(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const content = input.trim();
    if (!content || pending) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content },
    ];

    setMessages(nextMessages);
    setInput("");
    setPending(true);
    setError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          previousExtracted: extracted,
        }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        throw new Error(
          "現在アクセスが集中しています。少し時間をおいてから、もう一度お試しください。",
        );
      }

      if (!res.ok) {
        throw new Error("AIとの通信に失敗しました。");
      }

      const data = (await res.json()) as ChatApiResponse;

      // リセットにより中断されたリクエストの応答は反映しない
      // （abort()が間に合わず正常に完了した場合の保険）。
      if (abortControllerRef.current !== controller) return;

      const finalMessages: ChatMessage[] = [
        ...nextMessages,
        { role: "model", content: data.reply },
      ];
      setMessages(finalMessages);
      setExtracted(data.extracted);
      scheduleSave({ messages: finalMessages, extracted: data.extracted });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // リセットによる意図的な中断。エラー表示はしない。
        return;
      }

      // このリクエストがまだ最新のものである場合のみ、エラー表示と
      // 会話履歴のロールバックを行う（リセット後に新しい送信が
      // 始まっている場合は、そちらの状態を壊さないよう何もしない）。
      if (abortControllerRef.current === controller) {
        // 送信前の状態に戻し、失敗したユーザー発言を履歴に残さない。
        // 再送信時に同じ発言が重複して残ってしまうのを防ぐため。
        setMessages(messages);
        setInput(content);
        setError(
          err instanceof Error
            ? err.message
            : "AIとの通信に失敗しました。もう一度お試しください。",
        );
      }
    } finally {
      // このリクエストがまだ最新のものである場合のみ pending を解除する
      // （リセット後に新しい送信が始まっている場合、そちらの状態を壊さない）。
      if (abortControllerRef.current === controller) {
        setPending(false);
      }
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-4 py-6">
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-4 py-6">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          読み込み中...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 md:min-h-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
            {showPreview ? "ページのプレビュー" : "企画のヒアリング"}
          </h1>
          <SaveStatusIndicator status={saveStatus} />
        </div>
        <div className="flex items-center gap-2">
          {generatedPage && (
            <PublishStatus
              status={status}
              projectId={projectId}
              requesting={requestingReview}
              error={requestReviewError}
              onRequestReview={handleRequestReview}
            />
          )}
          {generatedPage && (
            <div className="flex rounded-full border border-black/[.08] p-0.5 text-sm dark:border-white/[.145]">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className={`rounded-full px-3 py-1 transition-colors ${
                  showPreview
                    ? "text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
                    : "bg-foreground text-background"
                }`}
              >
                チャット
              </button>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className={`rounded-full px-3 py-1 transition-colors ${
                  showPreview
                    ? "bg-foreground text-background"
                    : "text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
                }`}
              >
                プレビュー
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full border border-black/[.08] px-4 py-1.5 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            最初からやり直す
          </button>
        </div>
      </div>

      {showPreview && generatedPage ? (
        <PagePreview page={generatedPage} />
      ) : (
        <div className="flex flex-1 flex-col gap-4 md:min-h-0 md:flex-row">
          <div className="flex flex-1 flex-col md:min-h-0">
            <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-900">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                      message.role === "user"
                        ? "bg-foreground text-background"
                        : "bg-zinc-100 text-black dark:bg-zinc-800 dark:text-zinc-50"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {pending && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl bg-zinc-100 px-4 py-2 text-sm text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    考え中...
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            <form
              ref={formRef}
              onSubmit={handleSubmit}
              className="mt-4 flex items-end gap-2"
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="メッセージを入力（Shift+Enterで改行）"
                disabled={pending}
                rows={1}
                className="max-h-40 flex-1 resize-none overflow-y-auto rounded-2xl border border-black/[.08] bg-transparent px-4 py-2 text-black outline-none focus:border-black/40 disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
              />
              <button
                type="submit"
                disabled={pending || !input.trim()}
                className="rounded-full bg-foreground px-5 py-2 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                送信
              </button>
            </form>
          </div>

          <ExtractedPanel
            extracted={extracted}
            hasGeneratedPage={generatedPage !== null}
            generating={generating}
            generateError={generateError}
            onGenerate={handleGeneratePage}
          />
        </div>
      )}
    </div>
  );
}

function PublishStatus({
  status,
  projectId,
  requesting,
  error,
  onRequestReview,
}: {
  status: ProjectStatus;
  projectId: string | null;
  requesting: boolean;
  error: string | null;
  onRequestReview: () => void;
}) {
  if (status === "published") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-green-700 dark:text-green-400">公開済みです</span>
        {projectId && (
          <Link
            href={`/p/${projectId}`}
            target="_blank"
            className="text-zinc-500 underline hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            公開ページを見る
          </Link>
        )}
      </div>
    );
  }

  if (status === "in_review") {
    return (
      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        レビュー待ちです
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onRequestReview}
        disabled={requesting}
        className="rounded-full border border-black/[.08] px-4 py-1.5 text-sm transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        {requesting ? "申請中..." : "公開を申請する"}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;

  const label =
    status === "saving"
      ? "保存中..."
      : status === "saved"
        ? "保存済み"
        : "保存に失敗しました";

  const colorClass =
    status === "error"
      ? "text-red-600 dark:text-red-400"
      : "text-zinc-400 dark:text-zinc-500";

  return <span className={`text-xs ${colorClass}`}>{label}</span>;
}
