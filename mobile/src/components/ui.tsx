import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useColors, tokens } from "../theme";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { hapticImpact, hapticSelection } from "../haptics";

export function Screen({
  title,
  subtitle,
  children,
  refreshing,
  onRefresh,
  headerRight,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  headerRight?: React.ReactNode;
}) {
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const showHeader = Boolean(title || subtitle || headerRight);
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
      {showHeader ? (
        <View style={[row, { gap: 8, marginBottom: 14 }]}>
          <View style={{ flex: 1 }}>
            {title ? (
              <Text
                style={{
                  color: c.ink,
                  fontSize: tokens.title,
                  fontWeight: "700",
                  textAlign: textStart,
                  writingDirection,
                }}
              >
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text
                style={{
                  color: c.muted,
                  fontSize: tokens.subtitle,
                  marginTop: title ? 2 : 0,
                  textAlign: textStart,
                  writingDirection,
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {headerRight}
        </View>
      ) : null}
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
  const { row } = useLayoutDir();
  return (
    <View style={[row, { gap: 8 }, wrap ? { flexWrap: "wrap" } : null, style]}>
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
  const { writingDirection } = useLayoutDir();
  return (
    <Pressable
      unstable_pressDelay={0}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={({ pressed }) => ({
        backgroundColor: active ? c.accent : c.border + "80",
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          color: active ? c.bg : c.muted,
          fontSize: tokens.textXs,
          fontWeight: "600",
          writingDirection,
        }}
      >
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
  const { writingDirection } = useLayoutDir();
  const bg = variant === "primary" ? c.accent : variant === "warn" ? c.warn + "26" : "transparent";
  const fg = variant === "primary" ? c.bg : variant === "warn" ? c.warn : c.muted;
  return (
    <Pressable
      unstable_pressDelay={0}
      onPress={() => {
        hapticImpact();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: tokens.radiusSm,
        paddingHorizontal: small ? 10 : 16,
        paddingVertical: small ? 5 : 9,
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        borderWidth: variant === "ghost" ? 1 : 0,
        borderColor: c.border,
        alignItems: "center",
      })}
    >
      <Text
        style={{
          color: fg,
          fontSize: small ? tokens.textXs : tokens.text,
          fontWeight: "600",
          writingDirection,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
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
          textAlign: textStart, writingDirection,
          marginBottom: 8,
        },
        props.style,
      ]}
    />
  );
}

export function Label({ children }: { children: string }) {
  const c = useColors();
  const { textStart, writingDirection } = useLayoutDir();
  return (
    <Text
      style={{
        color: c.muted,
        fontSize: tokens.textXs,
        marginBottom: 4,
        textAlign: textStart, writingDirection,
      }}
    >
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
  const { writingDirection } = useLayoutDir();
  const map = {
    default: { bg: c.border + "99", fg: c.muted },
    accent: { bg: c.accent + "26", fg: c.accent },
    warn: { bg: c.warn + "26", fg: c.warn },
    good: { bg: c.good + "26", fg: c.good },
  } as const;
  const { bg, fg } = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: fg, fontSize: tokens.textXs, writingDirection }}>{label}</Text>
    </View>
  );
}

export function Checkbox({
  checked,
  onPress,
  disabled,
}: {
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: checked ? c.good : c.border,
        backgroundColor: checked ? c.good : "transparent",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {checked ? <Text style={{ color: c.bg, fontSize: 13, fontWeight: "700" }}>✓</Text> : null}
    </Pressable>
  );
}

export function EmptyState({ text }: { text: string }) {
  const c = useColors();
  const { writingDirection } = useLayoutDir();
  return (
    <Card>
      <Text
        style={{
          color: c.muted,
          fontSize: tokens.text,
          textAlign: "center",
          paddingVertical: 12,
          writingDirection,
        }}
      >
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

/** Pulsing placeholder block for progressive section loading. */
export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | `${number}%`; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View
      style={[
        {
          height,
          width,
          borderRadius: tokens.radiusSm,
          backgroundColor: c.border,
          opacity: 0.55,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <Card>
      <View style={{ gap: 8 }}>
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} height={i === 0 ? 14 : 10} width={i === 0 ? "55%" : "80%"} />
        ))}
      </View>
    </Card>
  );
}

export function KpiGridSkeleton({ count = 6 }: { count?: number }) {
  const c = useColors();
  const { row } = useLayoutDir();
  return (
    <View style={{ ...row, flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            flexGrow: 1,
            flexBasis: "30%",
            minWidth: 100,
            backgroundColor: c.surface,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: tokens.radiusSm,
            padding: 10,
            gap: 6,
          }}
        >
          <Skeleton height={10} width="70%" />
          <Skeleton height={18} width="50%" />
          <Skeleton height={8} width="60%" />
        </View>
      ))}
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = useColors();
  const { t } = useI18n();
  const { textStart, writingDirection, alignStart } = useLayoutDir();
  return (
    <Card style={{ borderColor: c.warn }}>
      <Text style={{ color: c.warn, textAlign: textStart, writingDirection }}>{message}</Text>
      {onRetry ? (
        <View style={{ marginTop: 8, alignSelf: alignStart }}>
          <Btn small variant="ghost" label={t("common.retry")} onPress={onRetry} />
        </View>
      ) : null}
    </Card>
  );
}

export function SectionTitle({
  children,
  onAdd,
  addLabel,
  onPress,
}: {
  children: string;
  onAdd?: () => void;
  addLabel?: string;
  onPress?: () => void;
}) {
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const title = (
    <Text
      style={{
        flex: 1,
        color: onPress ? c.accent : c.ink,
        fontSize: 16,
        fontWeight: "700",
        textAlign: textStart,
        writingDirection,
      }}
    >
      {children}
    </Text>
  );
  return (
    <View
      style={{
        ...row,
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 14,
        marginBottom: 8,
        gap: 8,
      }}
    >
      {onPress ? (
        <Pressable style={{ flex: 1 }} onPress={onPress} accessibilityRole="link">
          {title}
        </Pressable>
      ) : (
        title
      )}
      {onAdd ? (
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={addLabel ?? "+"}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? c.accent + "33" : c.accent + "22",
            borderWidth: 1,
            borderColor: c.accent,
          })}
        >
          <Text style={{ color: c.accent, fontSize: 18, fontWeight: "700", lineHeight: 20 }}>+</Text>
        </Pressable>
      ) : null}
    </View>
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

export { ScreenList, type ScreenListProps } from "./screen-list";
