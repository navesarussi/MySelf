import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";
import { confirmDelete } from "./ui";
import { useSession } from "../session";
import {
  ALL_BOTTOM_TAB_IDS,
  TAB_HREF,
  TAB_ICON,
  TAB_LABEL_KEY,
  useNavPrefs,
} from "../nav-prefs";

export function MoreMenuModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { t } = useI18n();
  const { textStart, writingDirection, row, menuAnchor } = useLayoutDir();
  const router = useRouter();
  const { signOut } = useSession();
  const { isBottomTab } = useNavPrefs();

  const items = ALL_BOTTOM_TAB_IDS.filter((id) => !isBottomTab(id)).map((id) => ({
    href: TAB_HREF[id],
    labelKey: TAB_LABEL_KEY[id],
    icon: TAB_ICON[id],
  }));

  function navigate(href: string) {
    onClose();
    router.push(href as `/${string}`);
  }

  function logout() {
    onClose();
    confirmDelete(t("mobile.logoutConfirm"), () => signOut(), t("nav.logout"), t("common.cancel"));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={onClose}>
        <View style={{ paddingTop: 56, paddingHorizontal: 16, ...menuAnchor }}>
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
                  textAlign: textStart, writingDirection,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                {t("nav.menu")}
              </Text>
              {items.map(({ href, labelKey, icon }) => (
                <Pressable
                  key={href}
                  onPress={() => navigate(href)}
                  style={({ pressed }) => ({
                    ...row,
                    gap: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    backgroundColor: pressed ? c.border : "transparent",
                  })}
                >
                  <Ionicons name={icon} size={18} color={c.accent} />
                  <Text
                    style={{
                      color: c.ink,
                      fontSize: tokens.textSm,
                      flex: 1,
                      textAlign: textStart, writingDirection,
                    }}
                  >
                    {t(labelKey)}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={logout}
                style={({ pressed }) => ({
                  ...row,
                  gap: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  borderTopWidth: 1,
                  borderTopColor: c.border,
                  backgroundColor: pressed ? c.border : "transparent",
                })}
              >
                <Ionicons name="log-out-outline" size={18} color={c.warn} />
                <Text
                  style={{
                    color: c.warn,
                    fontSize: tokens.textSm,
                    flex: 1,
                    textAlign: textStart, writingDirection,
                  }}
                >
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
