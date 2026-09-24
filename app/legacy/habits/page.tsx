import { getSupabase } from "@/lib/supabase";
import { userDb } from "@/lib/db/user-db";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import type { Habit } from "@/lib/types";
import { HabitsSection } from "./habits-section";
import { getTranslations } from "@/lib/i18n";
import { isAddTarget } from "@/lib/add-menu";

export const revalidate = 30;

export default async function HabitsPage({
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
        <PageHeader title={t("habits.title")} />
        <DbWarning />
      </>
    );
  }

  const supabase = getSupabase();

  const db = await userDb();
  const { data: habits } = await db
    .from("habits")
    .select("*")
    .eq("archived", false)
    .order("created_at");

  return (
    <>
      <PageHeader title={t("habits.title")} subtitle={t("habits.subtitle")} />
      <HabitsSection habits={(habits as Habit[]) || []} defaultOpen={add === "habit"} />
    </>
  );
}
