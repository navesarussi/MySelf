import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";

const KEY_PREFIX = "myself.section.";

/** In-memory copy so a screen that remounts doesn't flash its default state before storage answers. */
const memory = new Map<string, boolean>();

/** Open/closed state for a section, remembered per device. */
export function useSectionOpen(id: string, defaultOpen: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(() => memory.get(id) ?? defaultOpen);
  useEffect(() => {
    if (memory.has(id)) return;
    let cancelled = false;
    AsyncStorage.getItem(KEY_PREFIX + id)
      .then((v) => {
        if (cancelled || v === null) return;
        const stored = v === "1";
        memory.set(id, stored);
        setOpen(stored);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id]);
  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      memory.set(id, next);
      AsyncStorage.setItem(KEY_PREFIX + id, next ? "1" : "0").catch(() => undefined);
      return next;
    });
  }, [id]);
  return [open, toggle];
}

/**
 * A section whose header opens and closes its body — long trading screens stay scannable, and each
 * section remembers how the user left it. `summary` shows next to the title while the section is closed.
 */
export function CollapsibleSection({
  id,
  title,
  defaultOpen = true,
  summary,
  right,
  children,
}: {
  /** Stable key for the remembered state, e.g. "trading.control.universe". */
  id: string;
  title: string;
  defaultOpen?: boolean;
  summary?: string | null;
  /** Actions shown at the end of the header (always visible). */
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const c = useColors();
  const { row, rtl, textStart, writingDirection } = useLayoutDir();
  const [open, toggle] = useSectionOpen(id, defaultOpen);
  return (
    <View>
      <View style={{ ...row, alignItems: "center", marginTop: 14, marginBottom: open ? 8 : 4, gap: 8 }}>
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={title}
          hitSlop={6}
          style={({ pressed }) => ({ flex: 1, ...row, alignItems: "center", gap: 6, opacity: pressed ? tokens.press : 1 })}
        >
          <Ionicons name={open ? "chevron-down" : rtl ? "chevron-back" : "chevron-forward"} size={16} color={c.muted} />
          <Text style={{ color: c.ink, fontSize: 16, fontWeight: "700", textAlign: textStart, writingDirection }}>{title}</Text>
          {!open && summary ? (
            <Text numberOfLines={1} style={{ flex: 1, color: c.muted, fontSize: tokens.textXs, textAlign: textStart, writingDirection }}>
              {summary}
            </Text>
          ) : null}
        </Pressable>
        {right}
      </View>
      {open ? children : null}
    </View>
  );
}
