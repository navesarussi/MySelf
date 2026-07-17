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
import { TAB_ICON, TAB_LABEL_KEY, type BottomTabId, useNavPrefs } from "../../src/nav-prefs";

export default function TabsLayout() {
  const { ready, token } = useSession();
  const { t } = useI18n();
  const c = useColors();
  const { ready: prefsReady, isBottomTab } = useNavPrefs();
  const [addOpen, setAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (!ready || !prefsReady) return <Loading />;
  if (!token) return <Redirect href="/login" />;

  function tabOptions(id: BottomTabId) {
    const visible = isBottomTab(id);
    return {
      title: t(TAB_LABEL_KEY[id]),
      href: visible ? undefined : (null as null),
      tabBarIcon: ({ color, size }: { color: string; size: number }) => (
        <Ionicons name={TAB_ICON[id]} color={color} size={size} />
      ),
    };
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: true,
          header: () => <AppTopBar onMenuPress={() => setMoreOpen(true)} />,
          headerShadowVisible: false,
          tabBarScrollEnabled: true,
          tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border, height: 60 },
          tabBarActiveTintColor: c.accent,
          tabBarInactiveTintColor: c.muted,
          tabBarLabelStyle: { fontSize: 10 },
        }}
      >
        <Tabs.Screen name="index" options={tabOptions("index")} />
        <Tabs.Screen name="tasks" options={tabOptions("tasks")} />
        <Tabs.Screen name="timeline" options={tabOptions("timeline")} />
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
                style={{ flex: 1, alignItems: "center", justifyContent: "center", top: -4 }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: c.accent,
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: "#000",
                    shadowOpacity: 0.25,
                    shadowRadius: 6,
                    elevation: 6,
                  }}
                >
                  <Ionicons name={addOpen ? "close" : "add"} size={22} color={c.bg} />
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
        <Tabs.Screen name="habits" options={tabOptions("habits")} />
        <Tabs.Screen name="relationships" options={tabOptions("relationships")} />
        <Tabs.Screen name="goals" options={tabOptions("goals")} />
        <Tabs.Screen name="library" options={tabOptions("library")} />
      </Tabs>
      <AddMenuModal visible={addOpen} onClose={() => setAddOpen(false)} />
      <MoreMenuModal visible={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
