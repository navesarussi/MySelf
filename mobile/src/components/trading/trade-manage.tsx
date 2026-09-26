import React, { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import type { TradeRow } from "@/lib/trading/types-client";
import { fmtPrice, fmtR } from "@/lib/trading/format";
import { api } from "../../api/resources";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { queryClient, queryKeys, useApiMutation } from "../../query";
import { useColors, tokens } from "../../theme";
import { useToast } from "../../toast";
import { Btn, Card, Input, confirmDelete } from "../ui";
import { TradingText } from "./blocks";
import { useLivePrice } from "./use-live-price";

/** Server refusals of a manual edit, in words the trader can act on. */
const EDIT_ERRORS = ["stop_above_price", "target_below_price", "target_below_stop", "invalid_stop", "invalid_target", "trade_not_open", "no_fill_yet"] as const;

const num = (s: string) => {
  const v = Number(s.replace(",", "."));
  return s.trim() && Number.isFinite(v) && v > 0 ? v : null;
};

/**
 * Trade card management: move the stop / target of an open position (synced to the broker's protective
 * orders), drop the target, close it at market — or cancel an entry that has not filled yet.
 */
export function TradeManageCard({ trade }: { trade: TradeRow }) {
  const { t } = useI18n();
  const c = useColors();
  const { row } = useLayoutDir();
  const { run, isPending } = useApiMutation();
  const { show } = useToast();
  const open = trade.state === "OPEN" || trade.state === "RISK_FREE";
  const live = useLivePrice(trade.symbol, trade.asset_class, open);
  const stop0 = trade.sim_state?.stop_price ?? trade.stop_price;
  const target0 = trade.sim_state?.target_price ?? trade.target_price;
  const entry = trade.entry_price;
  const oneR = trade.sim_state?.stop_distance ?? (entry !== null ? entry - trade.initial_stop_price : null);
  // A target 1000R out is the "no fixed target" marker (lib/trading/trade-edit.ts).
  const hasTarget = entry !== null && oneR !== null && oneR > 0 ? (target0 - entry) / oneR < 500 : true;
  const [stop, setStop] = useState(String(stop0));
  const [target, setTarget] = useState(hasTarget ? String(target0) : "");
  useEffect(() => {
    setStop(String(stop0));
    setTarget(hasTarget ? String(target0) : "");
  }, [stop0, target0, hasTarget]);

  const newStop = num(stop);
  const newTarget = num(target);
  const lockedR = newStop !== null && entry !== null && oneR !== null && oneR > 0 ? (newStop - entry) / oneR : null;
  const stopChanged = newStop !== null && Math.abs(newStop - stop0) > Math.abs(stop0) * 1e-9;
  const targetChanged = hasTarget ? newTarget !== null && Math.abs(newTarget - target0) > Math.abs(target0) * 1e-9 : newTarget !== null;
  const invalid = useMemo(() => {
    const px = live.price;
    if (newStop === null) return t("trading.editInvalidStop");
    if (px !== null && newStop >= px) return t("trading.edit_stop_above_price");
    if (newTarget !== null && px !== null && newTarget <= px) return t("trading.edit_target_below_price");
    if (newTarget !== null && newTarget <= newStop) return t("trading.edit_target_below_stop");
    return null;
  }, [live.price, newStop, newTarget, t]);

  const refreshAll = () => void queryClient.invalidateQueries({ queryKey: queryKeys.tradingAll });
  const onError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : "";
    const code = EDIT_ERRORS.find((k) => msg.includes(k));
    show(code ? t(`trading.edit_${code}`) : msg || t("common.error"), "error");
  };

  const save = (body: { stop?: number; target?: number | null }) =>
    run((cfg) => api.tradingControl(cfg, { action: "edit_trade", trade_id: trade.id, ...body }), {
      suppressErrorToast: true,
      onError,
      onSuccess: (res) => {
        show(res.message, "success");
        refreshAll();
      },
    });

  const close = () =>
    confirmDelete(
      trade.state === "PENDING" ? t("trading.cancelOrderConfirm", { symbol: trade.symbol }) : t("trading.closeConfirm", { symbol: trade.symbol }),
      () =>
        void run((cfg) => api.tradingControl(cfg, { action: "close_position", trade_id: trade.id, confirm: true }), {
          onSuccess: (res) => {
            show(res.message, "success");
            refreshAll();
          },
        }),
      trade.state === "PENDING" ? t("trading.cancelOrder") : t("trading.close"),
      t("common.cancel")
    );

  if (trade.state === "PENDING") {
    return (
      <Card>
        <TradingText bold>{t("trading.manageTitle")}</TradingText>
        <TradingText muted size={tokens.textXs}>
          {t("trading.managePending", { price: fmtPrice(trade.entry_limit) })}
        </TradingText>
        <View style={{ ...row, marginTop: 10 }}>
          <Btn small variant="warn" label={t("trading.cancelOrder")} onPress={close} disabled={isPending()} />
        </View>
      </Card>
    );
  }
  if (!open) return null;

  return (
    <Card>
      <View style={{ ...row, gap: 8, alignItems: "baseline" }}>
        <TradingText bold>{t("trading.manageTitle")}</TradingText>
        <View style={{ flex: 1 }} />
        <TradingText muted size={tokens.textXs}>
          {t("trading.livePrice")} {live.price !== null ? fmtPrice(live.price) : t("trading.liveWaiting")}
        </TradingText>
      </View>
      <TradingText muted size={tokens.textXs}>
        {t("trading.stop")}
      </TradingText>
      <Input value={stop} onChangeText={setStop} keyboardType="decimal-pad" style={{ writingDirection: "ltr" }} />
      <TradingText muted size={tokens.textXs}>
        {t("trading.target")} · {t("trading.targetOptional")}
      </TradingText>
      <Input value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder={t("trading.noTarget")} style={{ writingDirection: "ltr" }} />
      <TradingText size={tokens.textXs} color={invalid ? c.warn : c.muted}>
        {invalid ?? (lockedR !== null ? t("trading.lockedAtStop", { r: fmtR(lockedR) }) : "")}
      </TradingText>
      <View style={{ ...row, gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <Btn
          small
          label={t("trading.saveLevels")}
          disabled={Boolean(invalid) || isPending() || (!stopChanged && !targetChanged)}
          onPress={() => void save({ ...(stopChanged && newStop !== null ? { stop: newStop } : {}), ...(targetChanged ? { target: newTarget } : {}) })}
        />
        {hasTarget ? <Btn small variant="ghost" label={t("trading.removeTarget")} disabled={isPending()} onPress={() => void save({ target: null })} /> : null}
        <View style={{ flex: 1 }} />
        <Btn small variant="warn" label={t("trading.closeNow")} onPress={close} disabled={isPending()} />
      </View>
    </Card>
  );
}
