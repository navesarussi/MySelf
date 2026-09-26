import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "finance.sectionCollapse.v1";

type CollapseMap = Record<string, boolean>;

export function useFinanceSectionCollapse(scope: string) {
  const [collapsed, setCollapsed] = useState<CollapseMap>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as Record<string, CollapseMap>;
          if (parsed[scope]) setCollapsed(parsed[scope]);
        } catch {
          /* ignore corrupt cache */
        }
      })
      .finally(() => setReady(true));
  }, [scope]);

  const persist = useCallback(
    (next: CollapseMap) => {
      AsyncStorage.getItem(STORAGE_KEY)
        .then((raw) => {
          let all: Record<string, CollapseMap> = {};
          if (raw) {
            try {
              all = JSON.parse(raw) as Record<string, CollapseMap>;
            } catch {
              all = {};
            }
          }
          all[scope] = next;
          return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        })
        .catch(() => {});
    },
    [scope]
  );

  const isCollapsed = useCallback((key: string, defaultCollapsed = false) => {
    if (!ready) return defaultCollapsed;
    return collapsed[key] ?? defaultCollapsed;
  }, [collapsed, ready]);

  const toggle = useCallback(
    (key: string) => {
      setCollapsed((prev) => {
        const next = { ...prev, [key]: !prev[key] };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  return { isCollapsed, toggle, ready };
}
