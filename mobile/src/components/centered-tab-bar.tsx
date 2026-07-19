import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "../i18n";
import { useColors } from "../theme";
import {
  TAB_ICON,
  TAB_LABEL_KEY,
  type BottomTabId,
  useNavPrefs,
} from "../nav-prefs";

/** Preferred left-to-right order (LTR bar). Home is always last = visual right. */
const TAB_ORDER: BottomTabId[] = [
  "tasks",
  "timeline",
  "habits",
  "relationships",
  "goals",
  "library",
  "index",
];

/**
 * Custom bottom bar: + is always dead-center; visible tabs split evenly
 * left/right with Home pinned to the far right. Uses forced LTR so Hebrew
 * RTL does not reverse tab positions.
 */
export function CenteredTabBar({
  state,
  descriptors,
  navigation,
  onAddPress,
}: BottomTabBarProps & { onAddPress: () => void }) {
  const c = useColors();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { isBottomTab } = useNavPrefs();
  const bottomPad = Math.max(insets.bottom, 10) + 10;

  const routeByName = useMemo(() => {
    const map = new Map(state.routes.map((r) => [r.name, r]));
    return map;
  }, [state.routes]);

  const visibleIds = TAB_ORDER.filter((id) => isBottomTab(id) && routeByName.has(id));
  const mid = Math.ceil(visibleIds.length / 2);
  const leftIds = visibleIds.slice(0, mid);
  const rightIds = visibleIds.slice(mid);

  function renderTab(id: BottomTabId) {
    const route = routeByName.get(id);
    if (!route) return null;
    const index = state.routes.findIndex((r) => r.key === route.key);
    const focused = state.index === index;
    const { options } = descriptors[route.key];
    const color = focused ? c.accent : c.muted;
    const label = t(TAB_LABEL_KEY[id]);

    const onPress = () => {
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    };

    const onLongPress = () => {
      navigation.emit({ type: "tabLongPress", target: route.key });
    };

    return (
      <Pressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
        onPress={onPress}
        onLongPress={onLongPress}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 4 }}
      >
        <Ionicons name={TAB_ICON[id]} color={color} size={22} />
        <Text numberOfLines={1} style={{ color, fontSize: 10, marginTop: 2, textAlign: "center" }}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      style={{
        flexDirection: "row",
        direction: "ltr",
        alignItems: "center",
        backgroundColor: c.surface,
        borderTopColor: c.border,
        borderTopWidth: 1,
        paddingTop: 6,
        paddingBottom: bottomPad,
        minHeight: 52 + bottomPad,
      }}
    >
      <View style={{ flex: 1, flexDirection: "row" }}>{leftIds.map(renderTab)}</View>

      <Pressable
        onPress={onAddPress}
        accessibilityRole="button"
        accessibilityLabel={t("addMenu.title")}
        style={{ width: 64, alignItems: "center", justifyContent: "center", top: -4 }}
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
          <Ionicons name="add" size={22} color={c.bg} />
        </View>
      </Pressable>

      <View style={{ flex: 1, flexDirection: "row" }}>{rightIds.map(renderTab)}</View>
    </View>
  );
}
