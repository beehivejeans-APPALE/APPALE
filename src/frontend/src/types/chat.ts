export type ChatMessage = {
  role: "user" | "model";
  content: string;
};

export type ExtractedFields = {
  purpose: string;
  target: string;
  story: string;
  reward: string;
};

export const EMPTY_EXTRACTED_FIELDS: ExtractedFields = {
  purpose: "",
  target: "",
  story: "",
  reward: "",
};

/**
 * AIが1ターンごとに返す抽出結果。各項目は3状態を取りうる:
 * - 文字列（非空）: その内容が分かった/更新された
 * - ""（空文字列）: 今回のターンでは言及がなかった（＝前回までの内容を維持してよい）
 * - null: ユーザーが明示的に訂正・撤回し、この項目を未入力に戻すべき
 */
export type ExtractedFieldUpdates = {
  purpose: string | null;
  target: string | null;
  story: string | null;
  reward: string | null;
};

export type ChatApiResponse = {
  reply: string;
  extracted: ExtractedFieldUpdates;
};

export function mergeExtractedFields(
  prev: ExtractedFields,
  updates: ExtractedFieldUpdates,
): ExtractedFields {
  return {
    purpose: updates.purpose === null ? "" : updates.purpose || prev.purpose,
    target: updates.target === null ? "" : updates.target || prev.target,
    story: updates.story === null ? "" : updates.story || prev.story,
    reward: updates.reward === null ? "" : updates.reward || prev.reward,
  };
}
