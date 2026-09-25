import React from "react";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors } from "../theme";

/** Stack header back/close — chevron on the locale-leading edge (right in Hebrew). */
export function NavigationBackButton({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  const c = useColors();
  const { chevronBack } = useLayoutDir();
  const { t } = useI18n();

  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      accessibilityRole="button"
      accessibilityLabel={t("common.back")}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={chevronBack} size={24} color={c.ink} />
    </Pressable>
  );
}
