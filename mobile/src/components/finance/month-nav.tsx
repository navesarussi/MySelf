import React from "react";
import { useI18n } from "../../i18n";
import { TimeNav } from "../ui/time-nav";

export function FinanceMonthNav(
  props: Omit<React.ComponentProps<typeof TimeNav>, "prevLabel" | "nextLabel">
) {
  const { t } = useI18n();
  return <TimeNav {...props} prevLabel={t("common.prevMonth")} nextLabel={t("common.nextMonth")} />;
}
