import React, { useMemo, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import type { Bar } from "@/lib/trading/types";
import { fmtPrice, fmtR } from "@/lib/trading/format";
import { useColors, tokens } from "../../theme";
import { useLayoutDir } from "../../layout-dir";

/** Lightweight View-based charts (no native chart dependency → no new native build). */

function useWidth() {
  const [w, setW] = useState(0);
  return { width: w, onLayout: (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width) };
}

function ChartLabel({ children }: { children: string }) {
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  return <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginBottom: 6 }}>{children}</Text>;
}

/** Filled line-like column chart; bars above/below a zero baseline when `baseline` is given. */
export function SeriesChart({ values, height = 120, title, baseline, format }: { values: number[]; height?: number; title?: string; baseline?: number; format?: (v: number) => string }) {
  const c = useColors();
  const { width, onLayout } = useWidth();
  const { min, max } = useMemo(() => {
    const lo = Math.min(...values, baseline ?? Infinity);
    const hi = Math.max(...values, baseline ?? -Infinity);
    return { min: lo, max: hi === lo ? lo + 1 : hi };
  }, [values, baseline]);
  const points = values.length > 0 && width > 0 ? downsample(values, Math.max(10, Math.floor(width / 3))) : [];
  const colW = points.length ? width / points.length : 0;
  const y = (v: number) => ((max - v) / (max - min)) * height;
  const base = baseline !== undefined ? y(baseline) : height;
  const last = values.at(-1);

  return (
    <View>
      {title ? <ChartLabel>{title}</ChartLabel> : null}
      <View onLayout={onLayout} style={{ height, position: "relative", overflow: "hidden", direction: "ltr" }}>
        {baseline !== undefined ? <View style={{ position: "absolute", left: 0, right: 0, top: base, height: 1, backgroundColor: c.border }} /> : null}
        {points.map((v, i) => {
          const top = Math.min(y(v), base);
          const h = Math.max(1, Math.abs(y(v) - base));
          const good = baseline === undefined ? true : v >= baseline;
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                left: i * colW,
                width: Math.max(1, colW - 0.5),
                top,
                height: h,
                backgroundColor: (good ? c.good : c.warn) + (baseline === undefined ? "55" : "99"),
              }}
            />
          );
        })}
        {points.map((v, i) => (
          <View key={`l${i}`} style={{ position: "absolute", left: i * colW, width: Math.max(1, colW), top: y(v) - 1, height: 2, backgroundColor: v >= (baseline ?? -Infinity) ? c.good : c.warn }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4, direction: "ltr" }}>
        <Text style={{ color: c.muted, fontSize: tokens.textXs }}>{format ? format(min) : min.toFixed(2)}</Text>
        {last !== undefined ? <Text style={{ color: c.ink, fontSize: tokens.textXs, fontWeight: "700" }}>{format ? format(last) : last.toFixed(2)}</Text> : null}
        <Text style={{ color: c.muted, fontSize: tokens.textXs }}>{format ? format(max) : max.toFixed(2)}</Text>
      </View>
    </View>
  );
}

function downsample(values: number[], max: number) {
  if (values.length <= max) return values;
  const step = values.length / max;
  return Array.from({ length: max }, (_, i) => values[Math.min(values.length - 1, Math.floor((i + 1) * step) - 1)]);
}

/** R-multiple histogram. */
export function RHistogram({ bins, title }: { bins: { bin: number; count: number }[]; title?: string }) {
  const c = useColors();
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  return (
    <View>
      {title ? <ChartLabel>{title}</ChartLabel> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 110, gap: 3, direction: "ltr" }}>
        {bins.map((b) => (
          <View key={b.bin} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            {b.count > 0 ? <Text style={{ color: c.muted, fontSize: 9 }}>{b.count}</Text> : null}
            <View style={{ width: "100%", height: `${(b.count / maxCount) * 80}%`, minHeight: b.count ? 2 : 0, backgroundColor: b.bin < 0 ? c.warn : b.bin < 0.5 ? c.muted : c.good, borderRadius: 3 }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 3, marginTop: 4, direction: "ltr" }}>
        {bins.map((b) => (
          <Text key={b.bin} style={{ flex: 1, textAlign: "center", color: c.muted, fontSize: 8 }}>
            {Number.isInteger(b.bin) ? b.bin : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

export type ChartLevel = { price: number; label: string; tone: "good" | "warn" | "accent" | "muted" };
export type ChartMarker = { t: number; label: string; tone: "good" | "warn" | "accent" };

/** Candlestick chart with horizontal trade levels and event markers — the "screenshot" of every journal entry. */
export function CandleChart({ bars, levels = [], markers = [], height = 220 }: { bars: Bar[]; levels?: ChartLevel[]; markers?: ChartMarker[]; height?: number }) {
  const c = useColors();
  const { width, onLayout } = useWidth();
  const shown = bars.slice(-Math.max(20, Math.floor(width / 5)));
  const toneColor = (t: ChartLevel["tone"]) => (t === "good" ? c.good : t === "warn" ? c.warn : t === "accent" ? c.accent : c.muted);
  const { lo, hi } = useMemo(() => {
    const prices = [...shown.flatMap((b) => [b.h, b.l]), ...levels.map((l) => l.price)].filter(Number.isFinite);
    const a = Math.min(...prices);
    const b = Math.max(...prices);
    const pad = (b - a) * 0.04 || a * 0.01;
    return { lo: a - pad, hi: b + pad };
  }, [shown, levels]);
  if (!bars.length) return null;
  const labelW = 64;
  const plotW = Math.max(0, width - labelW);
  const colW = shown.length ? plotW / shown.length : 0;
  const y = (p: number) => ((hi - p) / (hi - lo)) * height;

  return (
    <View onLayout={onLayout} style={{ height: height + 16, position: "relative", direction: "ltr" }}>
      {levels.map((l) => (
        <React.Fragment key={`${l.label}${l.price}`}>
          <View style={{ position: "absolute", left: 0, width: plotW, top: y(l.price), height: 1, backgroundColor: toneColor(l.tone), opacity: 0.8 }} />
          <Text style={{ position: "absolute", left: plotW + 4, top: y(l.price) - 7, fontSize: 9, color: toneColor(l.tone), width: labelW - 4 }} numberOfLines={1}>
            {l.label} {fmtPrice(l.price)}
          </Text>
        </React.Fragment>
      ))}
      {shown.map((b, i) => {
        const up = b.c >= b.o;
        const color = up ? c.good : c.warn;
        const bodyTop = y(Math.max(b.o, b.c));
        const bodyH = Math.max(1, Math.abs(y(b.o) - y(b.c)));
        const cx = i * colW + colW / 2;
        return (
          <React.Fragment key={b.t}>
            <View style={{ position: "absolute", left: cx - 0.5, width: 1, top: y(b.h), height: Math.max(1, y(b.l) - y(b.h)), backgroundColor: color }} />
            <View style={{ position: "absolute", left: i * colW + colW * 0.15, width: Math.max(1, colW * 0.7), top: bodyTop, height: bodyH, backgroundColor: color }} />
          </React.Fragment>
        );
      })}
      {markers.map((m) => {
        const i = shown.findIndex((b) => b.t >= m.t);
        if (i < 0) return null;
        const color = m.tone === "good" ? c.good : m.tone === "warn" ? c.warn : c.accent;
        return (
          <React.Fragment key={`${m.t}${m.label}`}>
            <View style={{ position: "absolute", left: i * colW + colW / 2, top: 0, width: 1, height, backgroundColor: color, opacity: 0.35 }} />
            <Text style={{ position: "absolute", left: Math.min(plotW - 30, i * colW + 2), top: height + 2, fontSize: 9, color }}>{m.label}</Text>
          </React.Fragment>
        );
      })}
    </View>
  );
}

/** Horizontal bar list for grouped stats (expectancy per group, centred on 0). */
export function GroupBars({ rows, title }: { rows: { key: string; value: number; sub: string }[]; title?: string }) {
  const c = useColors();
  const { row } = useLayoutDir();
  const maxAbs = Math.max(0.1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <View style={{ gap: 6 }}>
      {title ? <ChartLabel>{title}</ChartLabel> : null}
      {rows.map((r) => (
        <View key={r.key} style={{ ...row, gap: 8 }}>
          <Text style={{ width: 92, color: c.ink, fontSize: tokens.textXs }} numberOfLines={1}>
            {r.key}
          </Text>
          <View style={{ flex: 1, height: 12, flexDirection: "row", direction: "ltr" }}>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              {r.value < 0 ? <View style={{ width: `${(Math.abs(r.value) / maxAbs) * 100}%`, height: 12, backgroundColor: c.warn, borderRadius: 3 }} /> : null}
            </View>
            <View style={{ width: 1, backgroundColor: c.border }} />
            <View style={{ flex: 1 }}>
              {r.value >= 0 ? <View style={{ width: `${(r.value / maxAbs) * 100}%`, height: 12, backgroundColor: c.good, borderRadius: 3 }} /> : null}
            </View>
          </View>
          <Text style={{ width: 88, color: r.value >= 0 ? c.good : c.warn, fontSize: tokens.textXs, fontWeight: "600" }} numberOfLines={1}>
            {fmtR(r.value)} · {r.sub}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function KpiGrid({ items }: { items: { label: string; value: string; tone?: "good" | "warn" | "default"; hint?: string }[] }) {
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
      {items.map((k) => (
        <View key={k.label} style={{ flexGrow: 1, flexBasis: "30%", minWidth: 100, backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: tokens.radiusSm, padding: 10 }}>
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>{k.label}</Text>
          <Text style={{ color: k.tone === "good" ? c.good : k.tone === "warn" ? c.warn : c.ink, fontSize: 17, fontWeight: "800", marginTop: 2, textAlign: textStart }}>{k.value}</Text>
          {k.hint ? <Text style={{ color: c.muted, fontSize: 10, marginTop: 2, textAlign: textStart, writingDirection }}>{k.hint}</Text> : null}
        </View>
      ))}
    </View>
  );
}
