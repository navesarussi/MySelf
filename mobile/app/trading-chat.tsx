import React, { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { api } from "../src/api/resources";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { queryClient, queryKeys, useApiMutation, useApiQuery } from "../src/query";
import { Badge, Btn, Screen } from "../src/components/ui";
import type { ChatMessageRow } from "@/lib/trading/chat";

export default function TradingChatScreen() {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row, alignStart, alignEnd } = useLayoutDir();
  const { run } = useApiMutation();
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const { data, refresh } = useApiQuery(queryKeys.tradingChat, (cfg) => api.tradingChat(cfg));
  const messages: ChatMessageRow[] = data ?? [];

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setOptimistic(text);
    setBusy(true);
    await run((cfg) => api.sendTradingChat(cfg, text), {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.tradingChat }),
    });
    await refresh();
    setOptimistic(null);
    setBusy(false);
  };

  const resolve = (id: string, confirm: boolean) =>
    run((cfg) => api.confirmTradingChat(cfg, id, confirm), {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.tradingAll });
        void queryClient.invalidateQueries({ queryKey: queryKeys.home });
      },
    });

  const bubble = (role: "user" | "assistant", content: string, key: string, extra?: React.ReactNode) => (
    <View
      key={key}
      style={{
        alignSelf: role === "user" ? alignEnd : alignStart,
        maxWidth: "90%",
        marginBottom: 10,
        backgroundColor: role === "user" ? c.accent + "22" : c.surface,
        borderRadius: tokens.radiusSm,
        borderWidth: 1,
        borderColor: c.border,
        padding: 12,
      }}
    >
      <Text selectable style={{ color: c.ink, textAlign: textStart, writingDirection, lineHeight: 22 }}>
        {content}
      </Text>
      {extra}
    </View>
  );

  return (
    <Screen title={t("trading.hubChat")} subtitle={t("trading.chatSubtitle")}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={80}>
        <ScrollView ref={scrollRef} style={{ flex: 1, minHeight: 360 }} contentContainerStyle={{ paddingBottom: 16 }} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {bubble("assistant", t("trading.chatWelcome"), "welcome")}
          {messages.map((m) =>
            bubble(
              m.role,
              m.content,
              m.id,
              m.pending_command ? (
                <View style={{ marginTop: 10, padding: 10, borderRadius: tokens.radiusSm, borderWidth: 1, borderColor: c.accent2 }}>
                  <Text style={{ color: c.ink, fontWeight: "700", textAlign: textStart, writingDirection }}>{m.pending_command.summary}</Text>
                  <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart }}>{m.pending_command.action}</Text>
                  {m.command_status === "PENDING" ? (
                    <View style={{ ...row, gap: 8, marginTop: 8 }}>
                      <Btn small label={t("trading.confirmCommand")} onPress={() => void resolve(m.id, true)} />
                      <Btn small variant="ghost" label={t("trading.rejectCommand")} onPress={() => void resolve(m.id, false)} />
                    </View>
                  ) : m.command_status ? (
                    <View style={{ marginTop: 6, alignSelf: "flex-start" }}>
                      <Badge label={t(`trading.command_${m.command_status}`)} tone={m.command_status === "CONFIRMED" ? "good" : "default"} />
                    </View>
                  ) : null}
                </View>
              ) : null
            )
          )}
          {optimistic ? bubble("user", optimistic, "optimistic") : null}
          {busy ? <ActivityIndicator color={c.accent} style={{ marginTop: 8 }} /> : null}
        </ScrollView>
        <View style={{ ...row, gap: 8, alignItems: "flex-end" }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t("trading.chatPlaceholder")}
            placeholderTextColor={c.muted}
            multiline
            style={{ flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: c.border, borderRadius: tokens.radiusSm, paddingHorizontal: 12, paddingVertical: 10, color: c.ink, textAlign: textStart, writingDirection }}
          />
          <Btn label={t("agent.send")} onPress={() => void send()} disabled={busy || !input.trim()} small />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
