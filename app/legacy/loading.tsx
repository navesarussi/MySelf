import { getTranslations } from "@/lib/i18n";

export default async function Loading() {
  const { t } = await getTranslations();

  return (
    <div className="space-y-4" aria-busy="true" aria-label={t("common.loading")}>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-border/40" />
      <div className="h-4 w-72 animate-pulse rounded bg-border/30" />
      <div className="card h-32 animate-pulse bg-border/20" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card h-24 animate-pulse bg-border/20" />
        <div className="card h-24 animate-pulse bg-border/20" />
      </div>
    </div>
  );
}
