import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useSession } from "../../src/session";
import { useI18n } from "../../src/i18n";
import { Loading } from "../../src/components/ui";
import { AddMenuModal } from "../../src/components/add-menu";
import { AppTopBar } from "../../src/components/app-top-bar";
import { MoreMenuModal } from "../../src/components/more-menu";
import { CenteredTabBar } from "../../src/components/centered-tab-bar";
import { TAB_LABEL_KEY, type BottomTabId, useNavPrefs } from "../../src/nav-prefs";

export default function TabsLayout() {
  const { ready, token } = useSession();
  const { t } = useI18n();
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
    };
  }

  return (
    <>
      <Tabs
        tabBar={(props) => (
          <CenteredTabBar {...props} onAddPress={() => setAddOpen((v) => !v)} />
        )}
        screenOptions={{
          headerShown: true,
          header: () => <AppTopBar onMenuPress={() => setMoreOpen(true)} />,
          headerShadowVisible: false,
        }}
      >
        <Tabs.Screen name="tasks" options={tabOptions("tasks")} />
        <Tabs.Screen name="timeline" options={tabOptions("timeline")} />
        <Tabs.Screen
          name="add"
          options={{
            title: "",
            href: null,
          }}
        />
        <Tabs.Screen name="habits" options={tabOptions("habits")} />
        <Tabs.Screen name="relationships" options={tabOptions("relationships")} />
        <Tabs.Screen name="goals" options={tabOptions("goals")} />
        <Tabs.Screen name="library" options={tabOptions("library")} />
        <Tabs.Screen name="index" options={tabOptions("index")} />
        <Tabs.Screen
          name="settings"
          options={{
            href: null,
            title: t("nav.settings"),
          }}
        />
      </Tabs>
      <AddMenuModal visible={addOpen} onClose={() => setAddOpen(false)} />
      <MoreMenuModal visible={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
