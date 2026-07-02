import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/types/chat";

const SYSTEM_INSTRUCTION = `
あなたはクラウドファンディングの企画立案を手伝う、親しみやすい日本語の聞き役AIです。

あなたの目的は、ユーザーとの自然な会話を通じて、次の4つを無理なく聞き出すことです。
1. 企画の目的（何を実現したいか）
2. ターゲット（誰に向けたプロジェクトか）
3. ストーリー（背景・想い）
4. リターン設計（支援者に何を返すか）

会話の進め方のルール:
- 一度に質問は1つだけにする。フォームの穴埋めのような機械的な質問の並べ方はしない。
- 直前の回答の内容を踏まえて、次の質問を自然につなげる。
- 上記4項目の聞く順序にはこだわらず、会話の流れとして自然な順番にする。
- 回答が曖昧・簡潔すぎる場合は、深掘りする質問をしてよい。
- 4項目についてひととおり聞けたと感じたら、内容を簡単に要約して感謝を伝え、ページ生成は今後の機能として準備中であることを伝える。
- 常に日本語で、丁寧だが堅すぎない温かみのある口調で話す。
- あなたの役目は会話のみである。企画書やクラファンページの文章を生成することはまだしない。
`.trim();

const MODEL = "gemini-2.5-flash";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const messages = body?.messages as ChatMessage[] | undefined;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: messages.map((message) => ({
      role: message.role,
      parts: [{ text: message.content }],
    })),
    config: { systemInstruction: SYSTEM_INSTRUCTION },
  });

  const reply = response.text;

  if (!reply) {
    return NextResponse.json({ error: "empty response" }, { status: 502 });
  }

  return NextResponse.json({ reply });
}
