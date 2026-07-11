import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import type { Habit, Goal, Commitment } from "@/lib/types";
import { HabitsSection } from "./habits-section";
import { GoalsSection } from "./goals-section";
import { CommitmentsSection } from "./commitments-section";

export const revalidate = 30;

export default async function HabitsPage() {
  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title="הרגלים, משימות, מטרות וחלומות" />
        <DbWarning />
      </>
    );
  }

  const supabase = getSupabase();
  const [{ data: habits }, { data: goals }, { data: commitments }] = await Promise.all([
    supabase.from("habits").select("*").eq("archived", false).order("created_at"),
    supabase.from("goals").select("*").order("sort_order"),
    supabase.from("commitments").select("*").order("commitment_date", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader title="הרגלים, משימות, מטרות וחלומות" />
      <HabitsSection habits={(habits as Habit[]) || []} />
      <GoalsSection goals={(goals as Goal[]) || []} />
      <CommitmentsSection commitments={(commitments as Commitment[]) || []} />
    </>
  );
}
