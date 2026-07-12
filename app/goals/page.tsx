import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import type { Goal, Commitment } from "@/lib/types";
import { GoalsSection } from "./goals-section";
import { CommitmentsSection } from "./commitments-section";

export const revalidate = 30;

export default async function GoalsPage() {
  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title="מטרות, חלומות ויעדים" />
        <DbWarning />
      </>
    );
  }

  const supabase = getSupabase();
  const [{ data: goals }, { data: commitments }] = await Promise.all([
    supabase.from("goals").select("*").order("sort_order"),
    supabase.from("commitments").select("*").order("commitment_date", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader title="מטרות, חלומות ויעדים" subtitle="יעדים ארוכי טווח, חלומות והתחייבויות" />
      <GoalsSection goals={(goals as Goal[]) || []} />
      <CommitmentsSection commitments={(commitments as Commitment[]) || []} />
    </>
  );
}
