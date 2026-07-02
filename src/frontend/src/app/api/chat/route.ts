import { ApiError, GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage, ExtractedFieldUpdates } from "@/types/chat";

const SYSTEM_INSTRUCTION = `
あなたはクラウドファンディングの企画立案を手伝う、親しみやすい日本語の聞き役AIです。

あなたの目的は、ユーザーとの自然な会話を通じて、次の4つを無理なく聞き出すことです。
1. purpose（目的）: 企画の目的（何を実現したいか）
2. target（ターゲット）: 誰に向けたプロジェクトか
3. story（ストーリー）: 背景・想い
4. reward（リターン設計）: 支援者に何を返すか

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

出力形式のルール:
- 必ず指定されたJSON形式で出力する。
- "message" には、ユーザーに見せる会話文（上記ルールに従った自然な日本語の相槌・質問）だけを入れる。JSONや項目名など、会話文以外の内容を含めない。
- "extracted" の各項目（purpose/target/story/reward）は、今回のターンで分かった内容だけを反映する。前のターンまでに分かった内容はアプリ側で保持されるため、繰り返す必要はない。各項目は次の3つのいずれかにする。
  1. 今回のやり取りで新しく分かった、または内容が更新された場合: その内容を簡潔な日本語の文章で入れる。
  2. 今回のやり取りでは特に言及がなかった場合: 空文字列（""）にする。
  3. ユーザーが以前の回答を明確に訂正・撤回し、その項目を振り出しに戻したいと伝えた場合のみ: null にする。
`.trim();

const MODEL = "gemini-2.5-flash";

const EXTRACTED_FIELD_DESCRIPTION =
  '今回のターンで新しく分かった/更新された内容があれば文字列、言及がなければ空文字列""、ユーザーが明示的に訂正・撤回した場合のみnull。';

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
    extracted: {
      type: "object",
      properties: {
        purpose: { type: ["string", "null"], description: EXTRACTED_FIELD_DESCRIPTION },
        target: { type: ["string", "null"], description: EXTRACTED_FIELD_DESCRIPTION },
        story: { type: ["string", "null"], description: EXTRACTED_FIELD_DESCRIPTION },
        reward: { type: ["string", "null"], description: EXTRACTED_FIELD_DESCRIPTION },
      },
      required: ["purpose", "target", "story", "reward"],
    },
  },
  required: ["message", "extracted"],
};

function toExtractedFieldUpdates(value: unknown): ExtractedFieldUpdates {
  if (typeof value !== "object" || value === null) {
    return { purpose: "", target: "", story: "", reward: "" };
  }

  const record = value as Record<string, unknown>;
  const normalize = (field: unknown): string | null =>
    typeof field === "string" ? field : field === null ? null : "";

  return {
    purpose: normalize(record.purpose),
    target: normalize(record.target),
    story: normalize(record.story),
    reward: normalize(record.reward),
  };
}

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
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
      },
    });

    const raw = response.text;

    if (!raw) {
      return NextResponse.json({ error: "empty response" }, { status: 502 });
    }

    let parsed: { message?: unknown; extracted?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error("Failed to parse Gemini JSON response:", error, raw);
      return NextResponse.json(
        { error: "invalid_model_response" },
        { status: 502 },
      );
    }

    if (typeof parsed.message !== "string" || parsed.message.trim() === "") {
      console.error("Gemini response has empty or missing message field:", raw);
      return NextResponse.json(
        { error: "invalid_model_response" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      reply: parsed.message,
      extracted: toExtractedFieldUpdates(parsed.extracted),
    });
  } catch (error) {
    console.error("Gemini API error:", error);

    if (error instanceof ApiError && error.status === 429) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    return NextResponse.json({ error: "gemini_error" }, { status: 502 });
  }
}
