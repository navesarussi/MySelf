import { getTranslations } from "@/lib/i18n";

export async function DbWarning() {
  const { t } = await getTranslations();

  return (
    <div className="card border-warn/40 bg-warn/5 p-4 text-sm">
      <p className="font-medium text-warn">{t("dbWarning.title")}</p>
      <p className="mt-1 text-muted">{t("dbWarning.body")}</p>
    </div>
  );
}
