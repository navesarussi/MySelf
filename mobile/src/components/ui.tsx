import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useColors, tokens } from "../theme";
import { useI18n } from "../i18n";

export function Screen({
  title,
  subtitle,
  children,
  refreshing,
  onRefresh,
  headerRight,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  headerRight?: React.ReactNode;
}) {
  const c = useColors();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ padding: tokens.padLg, paddingBottom: 48 }}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} />
        ) : undefined
      }
    >
      <View style={[styles.headerRow]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.ink, fontSize: tokens.title, fontWeight: "700", textAlign: "right" }}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ color: c.muted, fontSize: tokens.subtitle, marginTop: 2, textAlign: "right" }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {headerRight}
      </View>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: tokens.radius,
          padding: tokens.pad,
          marginBottom: 10,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Row({
  children,
  style,
  wrap,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  wrap?: boolean;
}) {
  return (
    <View
      style={[
        { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
        wrap ? { flexWrap: "wrap" } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: active ? c.accent : c.border + "80",
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
      }}
    >
      <Text style={{ color: active ? c.bg : c.muted, fontSize: tokens.textXs, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Btn({
  label,
  onPress,
  variant = "primary",
  disabled,
  small,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "warn" | "ghost";
  disabled?: boolean;
  small?: boolean;
}) {
  const c = useColors();
  const bg = variant === "primary" ? c.accent : variant === "warn" ? c.warn + "26" : "transparent";
  const fg = variant === "primary" ? c.bg : variant === "warn" ? c.warn : c.muted;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: bg,
        borderRadius: tokens.radiusSm,
        paddingHorizontal: small ? 10 : 16,
        paddingVertical: small ? 5 : 9,
        opacity: disabled ? 0.5 : 1,
        borderWidth: variant === "ghost" ? 1 : 0,
        borderColor: c.border,
        alignItems: "center",
      }}
    >
      <Text style={{ color: fg, fontSize: small ? tokens.textXs : tokens.text, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const c = useColors();
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...props}
      style={[
        {
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: tokens.radiusSm,
          paddingHorizontal: 12,
          paddingVertical: 9,
          color: c.ink,
          fontSize: tokens.text,
          textAlign: "right",
          marginBottom: 8,
        },
        props.style,
      ]}
    />
  );
}

export function Label({ children }: { children: string }) {
  const c = useColors();
  return (
    <Text style={{ color: c.muted, fontSize: tokens.textXs, marginBottom: 4, textAlign: "right" }}>
      {children}
    </Text>
  );
}

export function Badge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "accent" | "warn" | "good";
}) {
  const c = useColors();
  const map = {
    default: { bg: c.border + "99", fg: c.muted },
    accent: { bg: c.accent + "26", fg: c.accent },
    warn: { bg: c.warn + "26", fg: c.warn },
    good: { bg: c.good + "26", fg: c.good },
  } as const;
  const { bg, fg } = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: fg, fontSize: tokens.textXs }}>{label}</Text>
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  const c = useColors();
  return (
    <Card>
      <Text style={{ color: c.muted, fontSize: tokens.text, textAlign: "center", paddingVertical: 12 }}>
        {text}
      </Text>
    </Card>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ paddingVertical: 32, alignItems: "center" }}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = useColors();
  const { t } = useI18n();
  return (
    <Card style={{ borderColor: c.warn }}>
      <Text style={{ color: c.warn, textAlign: "right" }}>{message}</Text>
      {onRetry ? (
        <View style={{ marginTop: 8, alignItems: "flex-start" }}>
          <Btn small variant="ghost" label={t("common.loading")} onPress={onRetry} />
        </View>
      ) : null}
    </Card>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const c = useColors();
  return (
    <Text
      style={{
        color: c.ink,
        fontSize: 16,
        fontWeight: "700",
        marginTop: 14,
        marginBottom: 8,
        textAlign: "right",
      }}
    >
      {children}
    </Text>
  );
}

/** Cross-platform destructive confirm: Alert on native, window.confirm on web. */
export function confirmDelete(title: string, onConfirm: () => void, confirmLabel = "OK", cancelLabel = "Cancel") {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (window.confirm(title)) onConfirm();
    return;
  }
  Alert.alert(title, undefined, [
    { text: cancelLabel, style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
});
