import { getTranslations } from "@/lib/i18n";

export default async function PrivacyPage() {
  const { t } = await getTranslations();

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-10 text-sm leading-relaxed">
      <h1 className="text-xl font-bold">{t("privacy.title")}</h1>
      <p className="text-muted">{t("privacy.updated")}</p>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("privacy.whatIsTitle")}</h2>
        <p>{t("privacy.whatIsBody")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("privacy.googleTitle")}</h2>
        <p>{t("privacy.googleBody1")}</p>
        <p>{t("privacy.googleBody2")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("privacy.storageTitle")}</h2>
        <p>{t("privacy.storageBody")}</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">{t("privacy.contactTitle")}</h2>
        <p>
          {t("privacy.contactBody")}{" "}
          <a href="mailto:navesarussi@gmail.com" className="text-accent underline">
            navesarussi@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
