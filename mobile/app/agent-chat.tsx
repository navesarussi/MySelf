import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "../src/api/resources";
import { useSession } from "../src/session";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { NavigationBackButton } from "../src/components/navigation-back-button";
import { Btn, Screen } from "../src/components/ui";

type ChatMsg = { role: "user" | "assistant"; text: string; imageUri?: string };

type PendingImage = { uri: string; mimeType: string; base64: string };

export default function AgentChatScreen() {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row, alignStart, alignEnd } = useLayoutDir();
  const { token, serverUrl } = useSession();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", text: t("agent.welcome") },
  ]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("permission_denied");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const base64 = asset.base64 ?? "";
    if (!base64) return;
    setPendingImage({
      uri: asset.uri,
      mimeType: asset.mimeType ?? "image/jpeg",
      base64,
    });
  }

  async function send() {
    if (!token || busy) return;
    const text = input.trim();
    if (!text && !pendingImage) return;

    const userText =
      text ||
      t("agent.imageOnlyPrompt");
    setMessages((m) => [
      ...m,
      { role: "user", text: userText, imageUri: pendingImage?.uri },
    ]);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const result = await api.agentChat(
        { token, serverUrl },
        {
          message: userText,
          images: pendingImage
            ? [{ mimeType: pendingImage.mimeType, data: pendingImage.base64 }]
            : undefined,
        }
      );
      setMessages((m) => [...m, { role: "assistant", text: result.text }]);
      setPendingImage(null);
    } catch {
      setError("send_failed");
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => <NavigationBackButton />,
          headerBackVisible: false,
        }}
      />
      <Screen subtitle={t("agent.subtitle")}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 16 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg, i) => (
            <View
              key={i}
              style={{
                alignSelf: msg.role === "user" ? alignEnd : alignStart,
                maxWidth: "88%",
                marginBottom: 10,
                backgroundColor: msg.role === "user" ? c.accent + "22" : c.surface,
                borderRadius: tokens.radiusSm,
                borderWidth: 1,
                borderColor: c.border,
                padding: 12,
              }}
            >
              {msg.imageUri ? (
                <Image
                  source={{ uri: msg.imageUri }}
                  style={{ width: 200, height: 140, borderRadius: 8, marginBottom: 8 }}
                  resizeMode="cover"
                />
              ) : null}
              <Text style={{ color: c.ink, textAlign: textStart, writingDirection, lineHeight: 22 }}>
                {msg.text}
              </Text>
            </View>
          ))}
          {busy ? <ActivityIndicator color={c.accent} style={{ marginTop: 8 }} /> : null}
          {error ? (
            <Text style={{ color: c.warn, fontSize: tokens.textXs, marginTop: 8, textAlign: textStart, writingDirection }}>
              {t("common.error")}
            </Text>
          ) : null}
        </ScrollView>

        {pendingImage ? (
          <View style={{ ...row, alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Image source={{ uri: pendingImage.uri }} style={{ width: 48, height: 48, borderRadius: 6 }} />
            <Text style={{ color: c.muted, flex: 1, fontSize: tokens.textXs }}>{t("agent.imageAttached")}</Text>
            <Pressable onPress={() => setPendingImage(null)}>
              <Ionicons name="close-circle" size={22} color={c.muted} />
            </Pressable>
          </View>
        ) : null}

        <View style={{ ...row, gap: 8, alignItems: "flex-end" }}>
          <Pressable
            onPress={pickImage}
            accessibilityRole="button"
            style={{ padding: 10, borderRadius: tokens.radiusSm, borderWidth: 1, borderColor: c.border }}
          >
            <Ionicons name="image-outline" size={22} color={c.accent} />
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t("agent.inputPlaceholder")}
            placeholderTextColor={c.muted}
            multiline
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: tokens.radiusSm,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: c.ink,
              textAlign: textStart,
              writingDirection,
            }}
          />
          <Btn label={t("agent.send")} onPress={send} disabled={busy || (!input.trim() && !pendingImage)} small />
        </View>

      </KeyboardAvoidingView>
    </Screen>
    </>
  );
}
