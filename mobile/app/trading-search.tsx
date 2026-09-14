import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, type TradingProposal, type TradingProposalOption } from "../src/api/resources";
import { ApiError } from "../src/api/client";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useSession } from "../src/session";
import { useToast } from "../src/toast";
import { useColors, tokens } from "../src/theme";
import { queryClient, queryKeys } from "../src/query";
import { Badge, Btn, Card, Chip, EmptyState, Input, Screen, SectionTitle } from "../src/components/ui";
import { KpiGrid } from "../src/components/trading/charts";
import { TradingText } from "../src/components/trading/blocks";
import { useLivePrice } from "../src/components/trading/use-live-price";
import { fmtPct, fmtPrice, fmtUsd } from "@/lib/trading/format";

type Draft = { order_type: "MARKET" | "LIMIT"; entry: string; stop: string; target: string };

const toDraft = (o: TradingProposalOption): Draft => ({ order_type: o.plan.order_type, entry: String(o.plan.entry), stop: String(o.plan.stop), target: String(o.plan.target) });
const n = (s: string) => {
  const x = Number(s.replace(",", "."));
  return Number.isFinite(x) && x > 0 ? x : null;
};

/** "Search trade" → the agent's best plan now → (optional edits) → "Enter now". Two taps when accepting the plan. */
export default function TradingSearchScreen() {
  const { t } = useI18n();
  const c = useColors();
  const { row } = useLayoutDir();
  const router = useRouter();
  const { token, serverUrl } = useSession();
  const toast = useToast();
  const params = useLocalSearchParams<{ auto?: string }>();
  const [searching, setSearching] = useState(false);
  const [entering, setEntering] = useState(false);
  const [result, setResult] = useState<TradingProposal | null>(null);
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const errorText = useCallback((code: string) => {
    const key = code.split(":")[0];
    const known = t(`trading.searchErr_${key}`);
    return known.startsWith("trading.") ? code : `${known}${code.includes(":") ? ` (${code.split(":").slice(1).join(":")})` : ""}`;
  }, [t]);

  const search = useCallback(async () => {
    if (!token || !serverUrl) return;
    setSearching(true);
    setError(null);
    setResult(null);
    try {
      const raw = await api.tradingSearch({ token, serverUrl });
      const res: TradingProposal = { ...raw, options: raw.options ?? [], errors: raw.errors ?? [] };
      setResult(res);
      setSelected(0);
      setDraft(res.options[0] ? toDraft(res.options[0]) : null);
    } catch (err) {
      setError(err instanceof ApiError ? errorText(err.message) : t("common.error"));
    } finally {
      setSearching(false);
    }
  }, [token, serverUrl, t, errorText]);

  useEffect(() => {
    if (params.auto === "1" && !autoStarted.current) {
      autoStarted.current = true;
      void search();
    }
  }, [params.auto, search]);

  const option = result?.options?.[selected] ?? null;
  const live = useLivePrice(option?.symbol, option?.asset_class, Boolean(option));
  const marketPx = live.price ?? option?.price ?? null;
  const edited = option && draft ? draft.order_type !== option.plan.order_type || n(draft.entry) !== option.plan.entry || n(draft.stop) !== option.plan.stop || n(draft.target) !== option.plan.target : false;
  const entryPx = draft && option ? (draft.order_type === "MARKET" ? marketPx : n(draft.entry)) : null;
  const stopPx = draft ? n(draft.stop) : null;
  const targetPx = draft ? n(draft.target) : null;
  const risk = entryPx && stopPx && stopPx < entryPx ? entryPx - stopPx : null;
  const rr = risk && targetPx ? (targetPx - entryPx!) / risk : null;
  const draftValid = Boolean(risk && rr !== null && rr >= 2 - 1e-9);

  const enter = async () => {
    if (!token || !serverUrl || !result?.id || !option || !draft) return;
    setEntering(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { option: selected };
      if (edited) {
        body.order_type = draft.order_type;
        if (draft.order_type === "LIMIT" && n(draft.entry)) body.entry = n(draft.entry);
        if (stopPx) body.stop = stopPx;
        if (targetPx) body.target = targetPx;
      }
      const res = await api.tradingEnterProposal({ token, serverUrl }, result.id, body);
      toast.show(t("trading.searchEntered", { symbol: option.symbol }), "success");
      void queryClient.invalidateQueries({ queryKey: queryKeys.tradingAll });
      router.replace(`/trading-trade?id=${res.trade_id}` as `/${string}`);
    } catch (err) {
      setError(err instanceof ApiError ? errorText(err.message) : t("common.error"));
    } finally {
      setEntering(false);
    }
  };

  return (
    <Screen title={t("trading.searchTitle")} subtitle={t("trading.searchSubtitle")}>
      <Btn label={searching ? t("trading.searching") : result ? t("trading.searchAgain") : t("trading.searchButton")} onPress={() => void search()} disabled={searching || entering} />

      {searching ? (
        <Card>
          <View style={{ ...row, gap: 10, alignItems: "center" }}>
            <ActivityIndicator color={c.accent} />
            <View style={{ flex: 1 }}>
              <TradingText>{t("trading.searchingBody")}</TradingText>
            </View>
          </View>
        </Card>
      ) : null}

      {error ? (
        <Card style={{ borderColor: c.warn, backgroundColor: c.warn + "18" }}>
          <TradingText color={c.warn} bold>
            {error}
          </TradingText>
        </Card>
      ) : null}

      {result && !(result.options ?? []).length ? <EmptyState text={t("trading.searchNone", { n: result.scanned })} /> : null}

      {result && option && draft ? (
        <>
          <TradingText muted size={tokens.textXs}>
            {t("trading.searchScanned", { n: result.scanned })}
            {result.stocks_open ? ` · ${t("trading.stocksOpen")}` : ` · ${t("trading.stocksClosed")}`}
          </TradingText>

          {(result.options ?? []).length > 1 ? (
            <View style={{ ...row, gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {(result.options ?? []).map((o, i) => (
                <Chip
                  key={o.symbol}
                  label={`${o.symbol}${o.plan.rating ? ` ${o.plan.rating}/10` : ""}`}
                  active={i === selected}
                  onPress={() => {
                    setSelected(i);
                    setDraft(toDraft(o));
                    setError(null);
                  }}
                />
              ))}
            </View>
          ) : null}

          <Card style={{ marginTop: 8 }}>
            <View style={{ ...row, gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <TradingText bold size={20}>
                {option.symbol}
              </TradingText>
              <Badge label={option.asset_class === "STOCK" ? t("trading.assetStock") : t("trading.assetCrypto")} />
              <Badge label={t(`trading.tier_${option.tier}`)} tone={option.tier === "CONFIRMED" ? "good" : option.tier === "WATCH" ? "warn" : "accent"} />
              <Badge label={t(`trading.setup_${option.setup}`)} />
              {option.broker_tradable ? <Badge label={t("trading.brokerBadge")} tone="good" /> : <Badge label={t("trading.simOnly")} />}
              <View style={{ flex: 1 }} />
              {option.plan.rating ? (
                <TradingText bold size={22} color={option.plan.rating >= 7 ? c.good : option.plan.rating <= 4 ? c.warn : c.ink}>
                  {option.plan.rating}/10
                </TradingText>
              ) : null}
            </View>
            {option.plan.explanation ? (
              <View style={{ marginTop: 8 }}>
                <TradingText>{option.plan.explanation}</TradingText>
              </View>
            ) : (
              <TradingText muted size={tokens.textXs}>
                {t("trading.searchNoAgent", { msg: option.plan.error ?? "" })}
              </TradingText>
            )}
          </Card>

          <Card style={{ marginTop: 8, borderColor: c.accent + "55" }}>
            <View style={{ ...row, gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <TradingText muted size={tokens.textXs}>
                {t("trading.livePrice")}
              </TradingText>
              <Badge label={live.source === "stream" ? t("trading.liveStream") : live.source === "poll" ? t("trading.livePoll") : t("trading.liveWaiting")} tone={live.price ? "good" : "default"} />
            </View>
            <View style={{ ...row, gap: 8, alignItems: "baseline", marginTop: 4 }}>
              <TradingText bold size={28} color={live.direction === "up" ? c.good : live.direction === "down" ? c.warn : c.ink} style={{ writingDirection: "ltr" }}>
                {fmtPrice(marketPx)}
              </TradingText>
              {live.direction === "up" ? (
                <TradingText color={c.good} bold>
                  ▲
                </TradingText>
              ) : live.direction === "down" ? (
                <TradingText color={c.warn} bold>
                  ▼
                </TradingText>
              ) : null}
            </View>
          </Card>

          <SectionTitle>{t("trading.searchPlan")}</SectionTitle>
          <Card>
            <View style={{ ...row, gap: 6, marginBottom: 10 }}>
              <Chip label={t("trading.orderMarket")} active={draft.order_type === "MARKET"} onPress={() => setDraft({ ...draft, order_type: "MARKET" })} />
              <Chip label={t("trading.orderLimit")} active={draft.order_type === "LIMIT"} onPress={() => setDraft({ ...draft, order_type: "LIMIT" })} />
            </View>
            <TradingText muted size={tokens.textXs}>
              {draft.order_type === "MARKET" ? t("trading.entryMarketHint", { price: fmtPrice(marketPx) }) : t("trading.entry")}
            </TradingText>
            {draft.order_type === "LIMIT" ? <Input value={draft.entry} onChangeText={(v) => setDraft({ ...draft, entry: v })} keyboardType="decimal-pad" style={{ writingDirection: "ltr" }} /> : null}
            <TradingText muted size={tokens.textXs}>
              {t("trading.stop")}
            </TradingText>
            <Input value={draft.stop} onChangeText={(v) => setDraft({ ...draft, stop: v })} keyboardType="decimal-pad" style={{ writingDirection: "ltr" }} />
            <TradingText muted size={tokens.textXs}>
              {t("trading.target")}
            </TradingText>
            <Input value={draft.target} onChangeText={(v) => setDraft({ ...draft, target: v })} keyboardType="decimal-pad" style={{ writingDirection: "ltr" }} />
            {edited ? (
              <Btn small variant="ghost" label={t("trading.resetToAgent")} onPress={() => setDraft(toDraft(option))} />
            ) : null}
          </Card>

          <KpiGrid
            items={[
              { label: "R:R", value: rr === null ? "—" : rr.toFixed(2), tone: draftValid ? "good" : "warn" },
              { label: t("trading.stopPct"), value: risk && entryPx ? fmtPct(risk / entryPx, 2) : "—" },
              { label: t("trading.riskUsd"), value: option.preview && !edited ? fmtUsd(option.preview.risk_amount) : "≈", hint: option.preview && !edited ? fmtPct(option.preview.risk_pct, 2) : undefined },
              { label: t("trading.notional"), value: option.preview && !edited ? fmtUsd(option.preview.notional) : "≈" },
            ]}
          />

          {(option.envelope_blocks ?? []).length ? (
            <Card style={{ borderColor: c.warn }}>
              <TradingText color={c.warn}>{t("trading.searchBlocked", { blocks: (option.envelope_blocks ?? []).join(", ") })}</TradingText>
            </Card>
          ) : null}
          {!draftValid ? (
            <TradingText color={c.warn} size={tokens.textXs}>
              {t("trading.searchNeed2R")}
            </TradingText>
          ) : null}

          <View style={{ marginTop: 10 }}>
            <Btn label={entering ? t("trading.entering") : t("trading.enterNow")} onPress={() => void enter()} disabled={entering || searching || !draftValid || (option.envelope_blocks ?? []).length > 0 || (draft.order_type === "MARKET" && !marketPx)} />
          </View>
          <TradingText muted size={tokens.textXs}>
            {t("trading.searchFootnote")}
          </TradingText>
        </>
      ) : null}
    </Screen>
  );
}
