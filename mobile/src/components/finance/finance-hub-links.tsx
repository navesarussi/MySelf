import React from "react";
import { useI18n } from "../../i18n";
import { HubLinks } from "../ui/hub-links";

const LINKS = [
  { href: "/finance-import", labelKey: "finance.hubImport", icon: "cloud-upload-outline" as const },
  { href: "/finance-history", labelKey: "finance.hubHistory", icon: "time-outline" as const },
  { href: "/finance-planning", labelKey: "finance.hubPlanning", icon: "trending-up-outline" as const },
  { href: "/finance-wealth", labelKey: "finance.hubWealth", icon: "pie-chart-outline" as const },
];

export function FinanceHubLinks() {
  const { t } = useI18n();
  return <HubLinks links={LINKS.map((l) => ({ href: l.href, label: t(l.labelKey), icon: l.icon }))} />;
}
