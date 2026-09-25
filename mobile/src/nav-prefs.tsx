import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSession } from "./session";

/** Tab screens that can sit in the bottom bar (excluding the center + button). */
export type BottomTabId =
  | "index"
  | "tasks"
  | "timeline"
  | "habits"
  | "relationships"
  | "goals"
  | "library"
  | "finance"
  | "trading";

export const ALL_BOTTOM_TAB_IDS: BottomTabId[] = [
  "index",
  "tasks",
  "timeline",
  "habits",
  "relationships",
  "goals",
  "library",
  "finance",
  "trading",
];

export const DEFAULT_BOTTOM_TABS: BottomTabId[] = [
  "index",
  "tasks",
  "habits",
  "relationships",
  "finance",
  "trading",
];

/** Bumped when default set changes so existing installs pick up new tabs. */
const STORAGE_KEY = "myself.bottomTabs.v3";
/** Previous key: migrated (keeping the user's choices) and the new default tab appended. */
const LEGACY_STORAGE_KEY = "myself.bottomTabs.v2";
const TABS_ADDED_IN_V3: BottomTabId[] = ["trading"];

type NavPrefsValue = {
  ready: boolean;
  /** Tabs this account can open at all — trading only for the primary account. */
  tabIds: BottomTabId[];
  bottomTabs: BottomTabId[];
  isBottomTab: (id: BottomTabId) => boolean;
  toggleBottomTab: (id: BottomTabId) => void;
  resetBottomTabs: () => void;
};

const NavPrefsContext = createContext<NavPrefsValue>({
  ready: false,
  tabIds: ALL_BOTTOM_TAB_IDS,
  bottomTabs: DEFAULT_BOTTOM_TABS,
  isBottomTab: () => true,
  toggleBottomTab: () => {},
  resetBottomTabs: () => {},
});

function normalize(ids: unknown): BottomTabId[] {
  if (!Array.isArray(ids)) return [...DEFAULT_BOTTOM_TABS];
  const valid = ids.filter((id): id is BottomTabId =>
    ALL_BOTTOM_TAB_IDS.includes(id as BottomTabId)
  );
  const unique = [...new Set(valid)];
  if (unique.length === 0) return [...DEFAULT_BOTTOM_TABS];
  return unique;
}

export function NavPrefsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [bottomTabs, setBottomTabs] = useState<BottomTabId[]>(DEFAULT_BOTTOM_TABS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(async (raw) => {
        if (raw) {
          try {
            setBottomTabs(normalize(JSON.parse(raw)));
          } catch {
            /* ignore corrupt prefs */
          }
          return;
        }
        const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
        if (!legacy) return;
        try {
          const migrated = normalize([...normalize(JSON.parse(legacy)), ...TABS_ADDED_IN_V3]);
          setBottomTabs(migrated);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        } catch {
          /* ignore corrupt prefs */
        }
      })
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback((next: BottomTabId[]) => {
    const normalized = normalize(next);
    setBottomTabs(normalized);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)).catch(() => {});
  }, []);

  const toggleBottomTab = useCallback(
    (id: BottomTabId) => {
      setBottomTabs((prev) => {
        const has = prev.includes(id);
        let next: BottomTabId[];
        if (has) {
          if (prev.length <= 1) return prev;
          next = prev.filter((x) => x !== id);
        } else {
          next = [...prev, id];
        }
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    []
  );

  const { primary } = useSession();
  const tabIds = useMemo(
    () => ALL_BOTTOM_TAB_IDS.filter((id) => primary || id !== "trading"),
    [primary]
  );

  const value = useMemo<NavPrefsValue>(
    () => ({
      ready,
      tabIds,
      bottomTabs,
      isBottomTab: (id) => tabIds.includes(id) && bottomTabs.includes(id),
      toggleBottomTab,
      resetBottomTabs: () => persist([...DEFAULT_BOTTOM_TABS]),
    }),
    [ready, tabIds, bottomTabs, toggleBottomTab, persist]
  );

  return <NavPrefsContext.Provider value={value}>{children}</NavPrefsContext.Provider>;
}

export function useNavPrefs() {
  return useContext(NavPrefsContext);
}

export const TAB_LABEL_KEY: Record<BottomTabId, string> = {
  index: "nav.home",
  tasks: "nav.tasks",
  timeline: "nav.timeline",
  habits: "nav.habits",
  relationships: "nav.relationships",
  goals: "nav.goals",
  library: "nav.library",
  finance: "nav.finance",
  trading: "nav.trading",
};

export const TAB_HREF: Record<BottomTabId, `/${string}`> = {
  index: "/",
  tasks: "/tasks",
  timeline: "/timeline",
  habits: "/habits",
  relationships: "/relationships",
  goals: "/goals",
  library: "/library",
  finance: "/finance",
  trading: "/trading",
};

export const TAB_ICON: Record<
  BottomTabId,
  | "home-outline"
  | "checkbox-outline"
  | "time-outline"
  | "repeat"
  | "people-outline"
  | "flag-outline"
  | "book-outline"
  | "wallet-outline"
  | "trending-up-outline"
> = {
  index: "home-outline",
  tasks: "checkbox-outline",
  timeline: "time-outline",
  habits: "repeat",
  relationships: "people-outline",
  goals: "flag-outline",
  library: "book-outline",
  finance: "wallet-outline",
  trading: "trending-up-outline",
};
