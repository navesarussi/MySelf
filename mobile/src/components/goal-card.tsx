import React from "react";
import { Pressable, Text } from "react-native";
import { useColors, tokens } from "../theme";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { Badge, Btn, Card, Row } from "./ui";
import { hapticImpact, hapticSelection } from "../haptics";
import type { Goal } from "@/lib/types";

export const GoalCard = React.memo(function GoalCard({
  goal,
  busy,
  onPress,
  onToggleStatus,
}: {
  goal: Goal;
  busy?: boolean;
  onPress: (goal: Goal) => void;
  onToggleStatus: (goal: Goal) => void;
}) {
  const c = useColors();
  const { t } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();

  return (
    <Card style={goal.status === "done" ? { opacity: 0.6 } : undefined}>
      <Pressable
        unstable_pressDelay={0}
        style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        onPress={() => {
          hapticSelection();
          onPress(goal);
        }}
      >
        <Row wrap style={{ justifyContent: "flex-start" }}>
          <Text style={{ color: c.ink, fontWeight: "700", textAlign: textStart, writingDirection }}>
            {goal.title}
          </Text>
          {goal.category ? <Badge label={goal.category} tone="accent" /> : null}
          {goal.horizon ? <Badge label={`${t("common.horizon")}: ${goal.horizon}`} /> : null}
        </Row>
        {goal.first_step ? (
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 4 }}>
            {t("common.firstStep")}: {goal.first_step}
          </Text>
        ) : null}
        {goal.definition_of_done ? (
          <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection, marginTop: 2 }}>
            {t("common.definitionOfDone")}: {goal.definition_of_done}
          </Text>
        ) : null}
      </Pressable>
      <Row style={{ marginTop: 10 }}>
        <Btn
          small
          label={goal.status === "active" ? t("goals.markDoneBtn") : t("goals.restoreActive")}
          variant={goal.status === "active" ? "primary" : "ghost"}
          onPress={() => {
            hapticImpact();
            onToggleStatus(goal);
          }}
          disabled={busy}
        />
      </Row>
    </Card>
  );
});
