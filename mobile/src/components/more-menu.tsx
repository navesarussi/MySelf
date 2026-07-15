import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "../i18n";
import { useColors, tokens } from "../theme";
import { confirmDelete } from "./ui";
import { useSession } from "../session";

const MENU_ITEMS = [
  { href: "/timeline" as const, labelKey: "nav.timeline" as const, icon: "time-outline" as const },
  { href: "/goals" as const, labelKey: "nav.goals" as const, icon: "flag-outline" as const },
  { href: "/library" as const, labelKey: "nav.library" as const, icon: "book-outline" as const },
] as const;

export function MoreMenuModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { t } = useI18n();
  const router = useRouter();
  const { signOut } = useSession();

  function navigate(href: (typeof MENU_ITEMS)[number]["href"]) {
    onClose();
    router.push(href);
  }

  function logout() {
    onClose();
    confirmDelete(t("mobile.logoutConfirm"), () => signOut(), t("nav.logout"), t("common.cancel"));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose}>
        <View style={{ paddingTop: 56, paddingHorizontal: 16, alignItems: "flex-end" }}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                minWidth: 220,
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
                {t("nav.menu")}
              </Text>
              {MENU_ITEMS.map(({ href, labelKey, icon }) => (
                <Pressable
                  key={href}
                  onPress={() => navigate(href)}
                  style={({ pressed }) => ({
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    gap: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    backgroundColor: pressed ? c.border : "transparent",
                  })}
                >
                  <Ionicons name={icon} size={18} color={c.accent} />
                  <Text style={{ color: c.ink, fontSize: tokens.textSm, flex: 1, textAlign: "right" }}>
                    {t(labelKey)}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={logout}
                style={({ pressed }) => ({
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  borderTopWidth: 1,
                  borderTopColor: c.border,
                  backgroundColor: pressed ? c.border : "transparent",
                })}
              >
                <Ionicons name="log-out-outline" size={18} color={c.warn} />
                <Text style={{ color: c.warn, fontSize: tokens.textSm, flex: 1, textAlign: "right" }}>
                  {t("nav.logout")}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
