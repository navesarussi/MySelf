import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Tab screens that can sit in the bottom bar (excluding the center + button). */
export type BottomTabId =
  | "index"
  | "tasks"
  | "timeline"
  | "habits"
  | "relationships"
  | "goals"
  | "library";

export const ALL_BOTTOM_TAB_IDS: BottomTabId[] = [
  "index",
  "tasks",
  "timeline",
  "habits",
  "relationships",
  "goals",
  "library",
];

export const DEFAULT_BOTTOM_TABS: BottomTabId[] = ["index", "tasks", "habits", "relationships"];

const STORAGE_KEY = "myself.bottomTabs";
const MAX_BOTTOM_TABS = 4;

type NavPrefsValue = {
  ready: boolean;
  bottomTabs: BottomTabId[];
  isBottomTab: (id: BottomTabId) => boolean;
  toggleBottomTab: (id: BottomTabId) => void;
  resetBottomTabs: () => void;
};

const NavPrefsContext = createContext<NavPrefsValue>({
  ready: false,
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
  return unique.slice(0, MAX_BOTTOM_TABS);
}

export function NavPrefsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [bottomTabs, setBottomTabs] = useState<BottomTabId[]>(DEFAULT_BOTTOM_TABS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          setBottomTabs(normalize(JSON.parse(raw)));
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
          if (prev.length >= MAX_BOTTOM_TABS) return prev;
          next = [...prev, id];
        }
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    []
  );

  const value = useMemo<NavPrefsValue>(
    () => ({
      ready,
      bottomTabs,
      isBottomTab: (id) => bottomTabs.includes(id),
      toggleBottomTab,
      resetBottomTabs: () => persist([...DEFAULT_BOTTOM_TABS]),
    }),
    [ready, bottomTabs, toggleBottomTab, persist]
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
};

export const TAB_HREF: Record<BottomTabId, `/${string}`> = {
  index: "/",
  tasks: "/tasks",
  timeline: "/timeline",
  habits: "/habits",
  relationships: "/relationships",
  goals: "/goals",
  library: "/library",
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
> = {
  index: "home-outline",
  tasks: "checkbox-outline",
  timeline: "time-outline",
  habits: "repeat",
  relationships: "people-outline",
  goals: "flag-outline",
  library: "book-outline",
};
