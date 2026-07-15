import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "../../src/session";
import { useI18n } from "../../src/i18n";
import { useColors } from "../../src/theme";
import { Loading } from "../../src/components/ui";
import { AddMenuModal } from "../../src/components/add-menu";
import { AppTopBar } from "../../src/components/app-top-bar";
import { MoreMenuModal } from "../../src/components/more-menu";

export default function TabsLayout() {
  const { ready, token } = useSession();
  const { t } = useI18n();
  const c = useColors();
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (!ready) return <Loading />;
  if (!token) return <Redirect href="/login" />;

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: true,
          header: () => <AppTopBar onMenuPress={() => setMoreOpen(true)} />,
          headerShadowVisible: false,
          tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 60 },
          tabBarActiveTintColor: c.accent,
          tabBarInactiveTintColor: c.muted,
          tabBarLabelStyle: { fontSize: 10 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t("nav.home"),
            tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: t("nav.tasks"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="checkbox-outline" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            title: "",
            tabBarLabel: () => null,
            tabBarIcon: () => null,
            tabBarButton: () => (
              <Pressable
                onPress={() => setAddOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={addOpen ? t("common.close") : t("addMenu.title")}
                style={{ flex: 1, alignItems: "center", justifyContent: "center", top: -14 }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: c.accent,
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#000",
                    shadowOpacity: 0.25,
                    shadowRadius: 6,
                    elevation: 6,
                  }}
                >
                  <Ionicons name={addOpen ? "close" : "add"} size={24} color={c.bg} />
                </View>
              </Pressable>
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setAddOpen((v) => !v);
            },
          }}
        />
        <Tabs.Screen
          name="habits"
          options={{
            title: t("nav.habits"),
            tabBarIcon: ({ color, size }) => <Ionicons name="repeat" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="relationships"
          options={{
            title: t("nav.relationships"),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people-outline" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
      <AddMenuModal visible={addOpen} onClose={() => setAddOpen(false)} />
      <MoreMenuModal visible={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
