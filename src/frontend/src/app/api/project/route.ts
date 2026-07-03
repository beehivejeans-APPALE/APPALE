import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage, ExtractedFields, GeneratedPageContent } from "@/types/chat";
import { rowToProjectState, type ProjectRow } from "@/types/project";

// 現時点ではユーザーごとに「進行中のプロジェクトは1件」という前提（プロジェクト一覧・
// 新規作成UIは未実装）。将来複数プロジェクトを持てるようにする場合は、この前提ごと
// 見直しが必要になる（docs/04_PROJECT_SAVE.md 参照）。
async function findLatestProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  return supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

// ページ初回表示時に呼ばれる。ユーザーの既存プロジェクトを返すか、なければ新規作成して返す。
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: existing, error: selectError } = await findLatestProject(
    supabase,
    user.id,
  );

  if (selectError) {
    console.error("Failed to load project:", selectError);
    return NextResponse.json({ error: "database_error" }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({
      project: rowToProjectState(existing as ProjectRow),
    });
  }

  const { data: created, error: insertError } = await supabase
    .from("projects")
    .insert({ user_id: user.id })
    .select("*")
    .single();

  if (insertError || !created) {
    console.error("Failed to create project:", insertError);
    return NextResponse.json({ error: "database_error" }, { status: 500 });
  }

  return NextResponse.json({
    project: rowToProjectState(created as ProjectRow),
  });
}

function isExtractedFieldsShape(value: unknown): value is ExtractedFields {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.purpose === "string" &&
    typeof record.target === "string" &&
    typeof record.story === "string" &&
    typeof record.reward === "string"
  );
}

function isChatMessagesShape(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        (item.role === "user" || item.role === "model") &&
        typeof item.content === "string",
    )
  );
}

function isGeneratedPageShape(value: unknown): value is GeneratedPageContent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.title === "string" &&
    typeof record.tagline === "string" &&
    typeof record.story === "string" &&
    Array.isArray(record.rewards) &&
    record.rewards.every(
      (reward) =>
        typeof reward === "object" &&
        reward !== null &&
        typeof (reward as Record<string, unknown>).title === "string" &&
        typeof (reward as Record<string, unknown>).description === "string",
    )
  );
}

// 会話・抽出データ・生成済みページの自動保存に使う。渡されたキーだけを部分更新する。
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.id !== "string") {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  // 公開申請（draft → in_review）は他フィールドの部分更新とは独立して扱う。
  // クライアントから許可するのはこの遷移のみで、in_review → published への変更は
  // 今回実装しない（Supabase側で手動運用、詳細は docs/05_PUBLISH.md）。
  if ("status" in body) {
    if (body.status !== "in_review") {
      return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }

    const { data: current, error: selectError } = await supabase
      .from("projects")
      .select("status, generated_title")
      .eq("id", body.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (selectError) {
      console.error("Failed to load project for status update:", selectError);
      return NextResponse.json({ error: "database_error" }, { status: 500 });
    }

    // ページ生成前の申請や、draft以外からの申請は許可しない。
    if (!current || current.status !== "draft" || !current.generated_title) {
      return NextResponse.json(
        { error: "invalid_status_transition" },
        { status: 409 },
      );
    }

    const { error: updateError } = await supabase
      .from("projects")
      .update({ status: "in_review" })
      .eq("id", body.id)
      .eq("user_id", user.id)
      .eq("status", "draft");

    if (updateError) {
      console.error("Failed to update project status:", updateError);
      return NextResponse.json({ error: "database_error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  const update: Record<string, unknown> = {};

  if ("messages" in body) {
    if (!isChatMessagesShape(body.messages)) {
      return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }
    update.messages = body.messages;
  }

  if ("extracted" in body) {
    if (!isExtractedFieldsShape(body.extracted)) {
      return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }
    update.purpose = body.extracted.purpose;
    update.target = body.extracted.target;
    update.story = body.extracted.story;
    update.reward = body.extracted.reward;
  }

  if ("generatedPage" in body) {
    if (body.generatedPage === null) {
      update.generated_title = null;
      update.generated_tagline = null;
      update.generated_story = null;
      update.generated_rewards = null;
    } else if (isGeneratedPageShape(body.generatedPage)) {
      update.generated_title = body.generatedPage.title;
      update.generated_tagline = body.generatedPage.tagline;
      update.generated_story = body.generatedPage.story;
      update.generated_rewards = body.generatedPage.rewards;
    } else {
      return NextResponse.json({ error: "invalid request" }, { status: 400 });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", body.id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Failed to save project:", error);
    return NextResponse.json({ error: "database_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
