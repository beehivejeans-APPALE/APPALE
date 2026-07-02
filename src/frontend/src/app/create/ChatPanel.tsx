"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/types/chat";

const INITIAL_MESSAGE: ChatMessage = {
  role: "model",
  content:
    "こんにちは！クラウドファンディングの企画について、一緒に整理していきましょう。まずは、今回のプロジェクトでどんなことを実現したいか教えてください。",
};

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok) {
        throw new Error("AIとの通信に失敗しました。");
      }

      const data = await res.json();
      setMessages([...nextMessages, { role: "model", content: data.reply }]);
    } catch {
      setError("AIとの通信に失敗しました。もう一度お試しください。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
      <h1 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
        企画のヒアリング
      </h1>

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
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
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
  );
}
