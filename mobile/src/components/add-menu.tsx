import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { addTargetHref, type AddTarget } from "@/lib/add-menu";
import { SHOW_PROJECTS } from "@/lib/features";
import { useI18n } from "../i18n";
import { useColors, tokens } from "../theme";

const MENU_ITEMS: { target: AddTarget; icon: keyof typeof Ionicons.glyphMap }[] = [
  { target: "task", icon: "checkbox-outline" },
  { target: "contact", icon: "person-add-outline" },
  { target: "event", icon: "calendar-outline" },
  { target: "period", icon: "layers-outline" },
  { target: "project", icon: "flag-outline" },
  { target: "habit", icon: "repeat" },
  { target: "goal", icon: "flag-outline" },
  { target: "commitment", icon: "checkmark-done-outline" },
  { target: "entry", icon: "book-outline" },
];

export function AddMenuModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { t } = useI18n();
  const router = useRouter();
  const items = MENU_ITEMS.filter((i) => SHOW_PROJECTS || i.target !== "project");

  function select(target: AddTarget) {
    onClose();
    router.push(addTargetHref(target) as `/${string}`);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }} onPress={onClose}>
        <View style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 16, paddingBottom: 88 }}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                backgroundColor: c.surface,
                borderColor: c.border,
                borderWidth: 1,
                borderRadius: tokens.radius,
                overflow: "hidden",
              }}
            >
              <Text
                style={{
                  color: c.muted,
                  fontSize: tokens.textXs,
                  fontWeight: "600",
                  textAlign: "right",
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                {t("addMenu.title")}
              </Text>
              {items.map(({ target, icon }) => (
                <Pressable
                  key={target}
                  onPress={() => select(target)}
                  style={({ pressed }) => ({
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    gap: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    backgroundColor: pressed ? c.border : "transparent",
                  })}
                >
                  <Ionicons name={icon} size={16} color={c.accent} />
                  <Text style={{ color: c.ink, fontSize: tokens.textSm, flex: 1, textAlign: "right" }}>
                    {t(`addMenu.${target}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
