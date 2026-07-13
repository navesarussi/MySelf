import React from "react";
import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "../../src/i18n";
import { useColors } from "../../src/theme";
import { Card, Screen, confirmDelete } from "../../src/components/ui";
import { useSession } from "../../src/session";

export default function MoreScreen() {
  const c = useColors();
  const { t } = useI18n();
  const router = useRouter();
  const { signOut } = useSession();

  const items = [
    { href: "/timeline" as const, label: t("nav.timeline"), icon: "time-outline" as const },
    { href: "/goals" as const, label: t("nav.goals"), icon: "flag-outline" as const },
    { href: "/library" as const, label: t("nav.library"), icon: "book-outline" as const },
    { href: "/settings" as const, label: t("nav.settings"), icon: "settings-outline" as const },
  ];

  return (
    <Screen title={t("mobile.more")}>
      {items.map((item) => (
        <Pressable key={item.href} onPress={() => router.push(item.href)}>
          <Card>
            <Text style={{ color: c.ink, fontSize: 16, textAlign: "right" }}>
              <Ionicons name={item.icon} size={16} color={c.accent} /> {item.label}
            </Text>
          </Card>
        </Pressable>
      ))}
      <Pressable
        onPress={() =>
          confirmDelete(t("mobile.logoutConfirm"), () => signOut(), t("nav.logout"), t("common.cancel"))
        }
      >
        <Card style={{ borderColor: c.warn }}>
          <Text style={{ color: c.warn, fontSize: 16, textAlign: "right" }}>
            <Ionicons name="log-out-outline" size={16} color={c.warn} /> {t("nav.logout")}
          </Text>
        </Card>
      </Pressable>
    </Screen>
  );
}
