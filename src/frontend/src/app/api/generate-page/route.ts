import { ApiError, GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isExtractedComplete,
  type ExtractedFields,
  type GeneratedPageContent,
  type PageReward,
} from "@/types/chat";

const SYSTEM_INSTRUCTION = `
あなたはクラウドファンディングページの文章作成を手伝う、プロのライター兼編集者です。

企画者へのヒアリングで得られた次の4項目の内容をもとに、支援者に伝わるクラウドファンディングページの文章一式を作成してください。
1. purpose（目的）: 企画の目的（何を実現したいか）
2. target（ターゲット）: 誰に向けたプロジェクトか
3. story（ストーリー）: 背景・想い
4. reward（リターン設計）: 支援者に何を返すか

作成するもの:
- title: プロジェクトの見出しとなる短いタイトル。
- tagline: 「一言で言うと何のプロジェクトか」が伝わる短いキャッチコピー・要約（1文程度）。
- story: 目的・背景・想いを、支援者の共感を得られるように構成した本文。複数の段落に分け、日本語として自然な文章にする。見出し記号やMarkdown記法（#, *, - など）は使わず、プレーンテキストと改行のみで構成する。
- rewards: リターン設計の内容を、支援者向けに分かりやすく整理したリスト。ヒアリング内容から読み取れる区分ごとに1件ずつ作成する。各要素は title（リターン名。短く）と description（内容の説明文）を持つ。

厳守事項:
- 与えられた4項目の内容の範囲で作成し、事実にない内容を大きく誇張しない。
- 金額・個数・期間・数量などの具体的な数字は、ヒアリング内容に明記されている場合のみ使用する。明記されていない場合、数字を創作しない。
- 常に日本語で出力する。
- 出力は指定されたJSON形式のみとし、それ以外の文字列を含めない。
`.trim();

const MODEL = "gemini-2.5-flash";

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    tagline: { type: "string" },
    story: { type: "string" },
    rewards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
        required: ["title", "description"],
      },
    },
  },
  required: ["title", "tagline", "story", "rewards"],
};

class InvalidModelResponseError extends Error {}

function buildPrompt(extracted: ExtractedFields): string {
  return [
    `目的: ${extracted.purpose}`,
    `ターゲット: ${extracted.target}`,
    `ストーリー: ${extracted.story}`,
    `リターン設計: ${extracted.reward}`,
  ].join("\n");
}

function toPageRewards(value: unknown): PageReward[] | null {
  if (!Array.isArray(value)) return null;

  const rewards: PageReward[] = [];
  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).title !== "string" ||
      typeof (item as Record<string, unknown>).description !== "string"
    ) {
      return null;
    }
    rewards.push({
      title: (item as Record<string, unknown>).title as string,
      description: (item as Record<string, unknown>).description as string,
    });
  }
  return rewards;
}

function toGeneratedPageContent(raw: string): GeneratedPageContent {
  let parsed: {
    title?: unknown;
    tagline?: unknown;
    story?: unknown;
    rewards?: unknown;
  };
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("Failed to parse Gemini JSON response:", error, raw);
    throw new InvalidModelResponseError("failed to parse JSON response");
  }

  const rewards = toPageRewards(parsed.rewards);

  if (
    typeof parsed.title !== "string" ||
    parsed.title.trim() === "" ||
    typeof parsed.tagline !== "string" ||
    parsed.tagline.trim() === "" ||
    typeof parsed.story !== "string" ||
    parsed.story.trim() === "" ||
    rewards === null
  ) {
    console.error("Gemini response has invalid page content shape:", raw);
    throw new InvalidModelResponseError("invalid page content shape");
  }

  return {
    title: parsed.title,
    tagline: parsed.tagline,
    story: parsed.story,
    rewards,
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
  const extracted = body?.extracted as ExtractedFields | undefined;

  if (
    !extracted ||
    typeof extracted.purpose !== "string" ||
    typeof extracted.target !== "string" ||
    typeof extracted.story !== "string" ||
    typeof extracted.reward !== "string" ||
    !isExtractedComplete(extracted)
  ) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: buildPrompt(extracted) }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        // gemini-2.5-flash はデフォルトで内部思考（thinking）が有効なため、明示的に無効化する
        // （/api/chat と同様。thinking出力が応答テキストに混ざるのを防ぐ）。
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
      },
    });

    const raw = response.text;
    if (!raw) {
      throw new InvalidModelResponseError("empty response");
    }

    return NextResponse.json({ page: toGeneratedPageContent(raw) });
  } catch (error) {
    console.error("Gemini API error:", error);

    if (error instanceof ApiError && error.status === 429) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    if (error instanceof InvalidModelResponseError) {
      return NextResponse.json(
        { error: "invalid_model_response" },
        { status: 502 },
      );
    }

    return NextResponse.json({ error: "gemini_error" }, { status: 502 });
  }
}
