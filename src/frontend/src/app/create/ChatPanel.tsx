"use client";

import { useEffect, useRef, useState } from "react";
import {
  EMPTY_EXTRACTED_FIELDS,
  mergeExtractedFields,
  type ChatApiResponse,
  type ChatMessage,
  type ExtractedFields,
} from "@/types/chat";
import ExtractedPanel from "./ExtractedPanel";

const INITIAL_MESSAGE: ChatMessage = {
  role: "model",
  content:
    "こんにちは！クラウドファンディングの企画について、一緒に整理していきましょう。まずは、今回のプロジェクトでどんなことを実現したいか教えてください。",
};

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [extracted, setExtracted] = useState<ExtractedFields>(
    EMPTY_EXTRACTED_FIELDS,
  );
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleReset() {
    // 送信中のリクエストがあれば中断し、後から届く古い応答が
    // リセット後の状態を上書きしてしまわないようにする。
    abortControllerRef.current?.abort();
    setMessages([INITIAL_MESSAGE]);
    setExtracted(EMPTY_EXTRACTED_FIELDS);
    setInput("");
    setError(null);
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
        body: JSON.stringify({ messages: nextMessages }),
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

      setMessages([...nextMessages, { role: "model", content: data.reply }]);
      setExtracted((prev) => mergeExtractedFields(prev, data.extracted));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // リセットによる意図的な中断。エラー表示はしない。
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "AIとの通信に失敗しました。もう一度お試しください。",
      );
    } finally {
      // このリクエストがまだ最新のものである場合のみ pending を解除する
      // （リセット後に新しい送信が始まっている場合、そちらの状態を壊さない）。
      if (abortControllerRef.current === controller) {
        setPending(false);
      }
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 md:flex-row">
      <div className="flex flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
            企画のヒアリング
          </h1>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full border border-black/[.08] px-4 py-1.5 text-sm transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            最初からやり直す
          </button>
        </div>

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

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="メッセージを入力"
            disabled={pending}
            className="flex-1 rounded-full border border-black/[.08] bg-transparent px-4 py-2 text-black outline-none focus:border-black/40 disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
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

      <ExtractedPanel extracted={extracted} />
    </div>
  );
}
