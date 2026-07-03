import type {
  ChatMessage,
  ExtractedFields,
  GeneratedPageContent,
  PageReward,
} from "@/types/chat";

export type ProjectStatus = "draft" | "in_review" | "published";

// Supabase の projects テーブルの1行に対応する型（詳細は docs/03_DATABASE.md）。
export type ProjectRow = {
  id: string;
  user_id: string;
  purpose: string;
  target: string;
  story: string;
  reward: string;
  generated_title: string | null;
  generated_tagline: string | null;
  generated_story: string | null;
  generated_rewards: PageReward[] | null;
  messages: ChatMessage[];
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
};

// ChatPanel が扱いやすい形に整えた、projects 1行分の状態。
export type ProjectState = {
  id: string;
  messages: ChatMessage[];
  extracted: ExtractedFields;
  generatedPage: GeneratedPageContent | null;
  status: ProjectStatus;
};

export function rowToProjectState(row: ProjectRow): ProjectState {
  const generatedPage: GeneratedPageContent | null =
    row.generated_title &&
    row.generated_tagline &&
    row.generated_story &&
    row.generated_rewards
      ? {
          title: row.generated_title,
          tagline: row.generated_tagline,
          story: row.generated_story,
          rewards: row.generated_rewards,
        }
      : null;

  return {
    id: row.id,
    messages: row.messages,
    extracted: {
      purpose: row.purpose,
      target: row.target,
      story: row.story,
      reward: row.reward,
    },
    generatedPage,
    status: row.status,
  };
}

export type GetOrCreateProjectApiResponse = {
  project: ProjectState;
};

export type ProjectPatchBody = {
  id: string;
  messages?: ChatMessage[];
  extracted?: ExtractedFields;
  generatedPage?: GeneratedPageContent | null;
  // 公開申請（draft → in_review）専用。それ以外の値はサーバー側で拒否する
  // （in_review → published への変更は今回実装しない。Supabase側で手動運用）。
  status?: "in_review";
};
