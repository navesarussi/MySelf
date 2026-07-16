import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import { getTranslations } from "@/lib/i18n";
import type { Goal, Commitment } from "@/lib/types";
import { GoalsSection } from "./goals-section";
import { CommitmentsSection } from "./commitments-section";
import { isAddTarget } from "@/lib/add-menu";

export const revalidate = 30;

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { t } = await getTranslations();
  const sp = await searchParams;
  const add = isAddTarget(sp.add) ? sp.add : undefined;

  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title={t("goals.title")} />
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
      <PageHeader title={t("goals.title")} subtitle={t("goals.subtitle")} />
      <GoalsSection goals={(goals as Goal[]) || []} defaultOpen={add === "goal"} />
      <CommitmentsSection commitments={(commitments as Commitment[]) || []} defaultOpen={add === "commitment"} />
    </>
  );
}
