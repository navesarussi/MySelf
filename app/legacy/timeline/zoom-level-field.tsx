"use client";

import { inputClass } from "@/components/ui";
import { useTranslations } from "@/components/locale-provider";
import {
  DEFAULT_EVENT_MIN_ZOOM,
  TIMELINE_ZOOM_LEVELS,
  type TimelineZoomLevel,
} from "@/lib/timeline-zoom";

const ZOOM_LABEL_KEYS: Record<TimelineZoomLevel, "common.years" | "common.months" | "common.days" | "timeline.zoomHours"> = {
  years: "common.years",
  months: "common.months",
  days: "common.days",
  hours: "timeline.zoomHours",
};

export function ZoomLevelField({
  name = "min_zoom",
  defaultValue = DEFAULT_EVENT_MIN_ZOOM,
  className,
}: {
  name?: string;
  defaultValue?: TimelineZoomLevel;
  className?: string;
}) {
  const { t } = useTranslations();

  return (
    <label className={`text-xs text-muted ${className ?? ""}`}>
      {t("timeline.minZoomLabel")}
      <select name={name} defaultValue={defaultValue} className={`${inputClass} mt-1`}>
        {TIMELINE_ZOOM_LEVELS.map((level) => (
          <option key={level} value={level}>
            {t(ZOOM_LABEL_KEYS[level])}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-[10px] leading-snug">{t("timeline.minZoomHint")}</span>
    </label>
  );
}
