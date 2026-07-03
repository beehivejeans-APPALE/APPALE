import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PageReward } from "@/types/chat";

type PublishedProjectRow = {
  generated_title: string | null;
  generated_tagline: string | null;
  generated_story: string | null;
  generated_rewards: PageReward[] | null;
};

export default async function PublicProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("projects")
    .select("generated_title, generated_tagline, generated_story, generated_rewards")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle<PublishedProjectRow>();

  if (
    !data ||
    !data.generated_title ||
    !data.generated_tagline ||
    !data.generated_story ||
    !data.generated_rewards
  ) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-10 dark:bg-black">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-900">
        <h1 className="text-2xl font-bold text-black dark:text-zinc-50">
          {data.generated_title}
        </h1>
        <p className="mt-2 text-base text-zinc-600 dark:text-zinc-300">
          {data.generated_tagline}
        </p>

        <div className="mt-6 space-y-4 text-sm leading-relaxed whitespace-pre-wrap text-black dark:text-zinc-50">
          {data.generated_story}
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            リターン
          </h2>
          <ul className="mt-3 space-y-3">
            {data.generated_rewards.map((reward, index) => (
              <li
                key={index}
                className="rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]"
              >
                <p className="text-sm font-medium text-black dark:text-zinc-50">
                  {reward.title}
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {reward.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
