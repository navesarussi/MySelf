import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import type { Habit } from "@/lib/types";
import { HabitsSection } from "./habits-section";

export const revalidate = 30;

export default async function HabitsPage() {
  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title="הרגלים" />
        <DbWarning />
      </>
    );
  }

  const supabase = getSupabase();
  const { data: habits } = await supabase
    .from("habits")
    .select("*")
    .eq("archived", false)
    .order("created_at");

  return (
    <>
      <PageHeader title="הרגלים" subtitle="מעקב יומי, רצפים וסטטיסטיקות" />
      <HabitsSection habits={(habits as Habit[]) || []} />
    </>
  );
}
