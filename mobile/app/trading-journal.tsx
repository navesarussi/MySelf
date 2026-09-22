import React, { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { api } from "../src/api/resources";
import { useI18n } from "../src/i18n";
import { queryKeys, useApiQuery } from "../src/query";
import { Chip, EmptyState, Row, ScreenList } from "../src/components/ui";
import { TradeRowCard } from "../src/components/trading/blocks";
import type { TradeListItem } from "@/lib/trading/types-client";

type StateFilter = "all" | "open" | "closed";
type OutcomeFilter = "" | "win" | "loss";

export default function TradingJournalScreen() {
  const { t } = useI18n();
  const [state, setState] = useState<StateFilter>("all");
  const [outcome, setOutcome] = useState<OutcomeFilter>("");
  const [track, setTrack] = useState<"AGENT" | "DETERMINISTIC">("AGENT");
  const [execution, setExecution] = useState<"" | "SHADOW" | "PAPER">("");
  const filters = useMemo(() => ({ state, outcome: outcome || undefined, track, execution: execution || undefined }), [state, outcome, track, execution]);
  const { data, loading, refresh } = useApiQuery(queryKeys.tradingTrades(filters), (cfg) => api.tradingTrades(cfg, filters));

  const renderItem = useCallback(({ item }: { item: TradeListItem }) => <TradeRowCard trade={item} />, []);

  const header = (
    <View style={{ gap: 8 }}>
      <Row wrap>
        <Chip label={t("trading.trackAgent")} active={track === "AGENT"} onPress={() => setTrack("AGENT")} />
        <Chip label={t("trading.trackDeterministic")} active={track === "DETERMINISTIC"} onPress={() => setTrack("DETERMINISTIC")} />
      </Row>
      <Row wrap>
        {(["", "SHADOW", "PAPER"] as const).map((e) => (
          <Chip key={e || "all"} label={e || t("trading.filterAll")} active={execution === e} onPress={() => setExecution(e)} />
        ))}
      </Row>
      <Row wrap>
        <Chip label={t("trading.filterAll")} active={state === "all" && !outcome} onPress={() => { setState("all"); setOutcome(""); }} />
        <Chip label={t("trading.filterOpen")} active={state === "open"} onPress={() => { setState("open"); setOutcome(""); }} />
        <Chip label={t("trading.filterClosed")} active={state === "closed" && !outcome} onPress={() => { setState("closed"); setOutcome(""); }} />
        <Chip label={t("trading.filterWins")} active={outcome === "win"} onPress={() => { setState("closed"); setOutcome("win"); }} />
        <Chip label={t("trading.filterLosses")} active={outcome === "loss"} onPress={() => { setState("closed"); setOutcome("loss"); }} />
      </Row>
    </View>
  );

  return (
    <ScreenList
      title={t("trading.hubJournal")}
      subtitle={t("trading.journalSubtitle")}
      headerExtra={header}
      data={data ?? []}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      refreshing={loading}
      onRefresh={refresh}
      maxWidth={760}
      ListEmptyComponent={!loading ? <EmptyState text={t("trading.noTrades")} /> : null}
    />
  );
}
