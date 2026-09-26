import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FINANCE_CATEGORIES } from "@/lib/finance/categories";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Chip, Input } from "../ui";

export function CategoryPicker({
  categories,
  value,
  onChange,
  allowEmpty,
}: {
  categories: string[];
  value: string | null;
  onChange: (cat: string | null) => void;
  allowEmpty?: boolean;
}) {
  const { t } = useI18n();
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const merged = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const cat of [...FINANCE_CATEGORIES, ...categories]) {
      if (!seen.has(cat)) {
        seen.add(cat);
        out.push(cat);
      }
    }
    return out;
  }, [categories]);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return merged;
    return merged.filter((cat) => cat.includes(q));
  }, [merged, search]);

  const canCreate =
    search.trim().length > 0 &&
    !merged.some((cat) => cat === search.trim()) &&
    search.trim().length <= 40;

  function pick(cat: string | null) {
    onChange(cat);
    setOpen(false);
    setSearch("");
    setCreating(false);
    setNewName("");
  }

  function createCategory() {
    const name = (creating ? newName : search).trim();
    if (!name) return;
    pick(name);
  }

  return (
    <View>
      <Text
        style={{
          color: c.muted,
          fontSize: tokens.textXs,
          marginBottom: 8,
          textAlign: textStart,
          writingDirection,
        }}
      >
        {t("finance.category")}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={{
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: tokens.radiusSm,
          paddingHorizontal: 12,
          paddingVertical: 12,
          backgroundColor: c.surface,
        }}
      >
        <View style={{ ...row, alignItems: "center", gap: 8 }}>
          <Text
            style={{ flex: 1, minWidth: 0, color: value ? c.ink : c.muted, textAlign: textStart, writingDirection }}
            numberOfLines={1}
          >
            {value ?? t("finance.pickCategory")}
          </Text>
          <Ionicons name="chevron-down" size={16} color={c.muted} style={{ flexShrink: 0 }} />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              maxHeight: "75%",
              backgroundColor: c.bg,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: 16,
            }}
          >
            <Text
              style={{
                color: c.ink,
                fontWeight: "700",
                fontSize: tokens.title,
                marginBottom: 12,
                textAlign: textStart,
                writingDirection,
              }}
            >
              {t("finance.pickCategory")}
            </Text>

            {!creating ? (
              <>
                <Input
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t("finance.searchCategory")}
                  autoFocus
                />
                <ScrollView style={{ marginTop: 12, maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                  {allowEmpty ? (
                    <View style={{ marginBottom: 8 }}>
                      <Chip
                        label={t("finance.noCategory")}
                        active={value === null}
                        onPress={() => pick(null)}
                      />
                    </View>
                  ) : null}
                  <View style={{ ...row, flexWrap: "wrap", gap: 8 }}>
                    {filtered.map((cat) => (
                      <Chip key={cat} label={cat} active={value === cat} onPress={() => pick(cat)} />
                    ))}
                  </View>
                  {canCreate ? (
                    <View style={{ marginTop: 12 }}>
                      <Btn
                        label={t("finance.createCategory", { name: search.trim() })}
                        variant="ghost"
                        onPress={createCategory}
                      />
                    </View>
                  ) : null}
                </ScrollView>
                <View style={{ marginTop: 8 }}>
                  <Btn
                    label={t("finance.newCategory")}
                    variant="ghost"
                    onPress={() => {
                      setCreating(true);
                      setNewName(search);
                    }}
                  />
                </View>
              </>
            ) : (
              <>
                <Input
                  value={newName}
                  onChangeText={setNewName}
                  placeholder={t("finance.newCategoryPlaceholder")}
                  autoFocus
                />
                <View style={{ ...row, gap: 8, marginTop: 12 }}>
                  <Btn label={t("common.save")} onPress={createCategory} disabled={!newName.trim()} />
                  <Btn label={t("common.cancel")} variant="ghost" onPress={() => setCreating(false)} />
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
