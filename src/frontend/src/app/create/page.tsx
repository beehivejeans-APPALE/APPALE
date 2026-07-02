import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatPanel from "./ChatPanel";

export default async function CreatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 md:h-dvh md:flex-none md:overflow-hidden dark:bg-black">
      <ChatPanel />
    </div>
  );
}
