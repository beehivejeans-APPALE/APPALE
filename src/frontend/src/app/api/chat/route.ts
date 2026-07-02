import { ApiError, GoogleGenAI } from "@google/genai";
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
- 回答が曖昧・簡潔すぎる場合は、深掘りする質問をしてよいが、同じ項目についての深掘りは最大1〜2回までにする。「質問攻め」にならないよう注意する。
- ユーザーが「分からない」「まだ決まっていない」など曖昧な返答をした場合は、それ以上深掘りを重ねない。代わりに、その項目に関する具体例・選択肢を2〜3個提示し、「近いものはありますか？それとも一旦保留にして次に進みますか？」のように、答えやすい形で選ばせるか、次に進む提案をする。
- 全体を通して、ユーザーに「答えられない」ことへのプレッシャーを与えないこと。分からない・決まっていないという回答も歓迎し、優しく寄り添うトーンを保つ。
- 4項目についてひととおり聞けたと感じたら、内容を簡単に要約し、話してくれたことへの感謝を伝える。
- 常に日本語で、丁寧だが堅すぎない温かみのある口調で話す。
- あなたの役目は、今この場での会話のみである。企画書やクラファンページの文章を生成することはしない。
- 今後追加される予定の機能（ページ生成、その他の未実装機能など）については、一切言及しない。「準備中」「今後提供予定」といった言葉も使わない。
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

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: messages.map((message) => ({
        role: message.role,
        parts: [{ text: message.content }],
      })),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        // gemini-2.5-flash はデフォルトで内部思考（thinking）が有効なため、明示的に無効化する。
        // これがないと、モデルの思考過程がそのまま応答テキストに混ざって表示されてしまう。
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const reply = response.text;

    if (!reply) {
      return NextResponse.json({ error: "empty response" }, { status: 502 });
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Gemini API error:", error);

    if (error instanceof ApiError && error.status === 429) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429 },
      );
    }

    return NextResponse.json({ error: "gemini_error" }, { status: 502 });
  }
}
