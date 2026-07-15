import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../src/api/resources";
import { useApi, useMutate } from "../src/hooks";
import { useI18n } from "../src/i18n";
import { useColors, tokens } from "../src/theme";
import {
  Badge,
  Btn,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  Input,
  Loading,
  Row,
  Screen,
  confirmDelete,
} from "../src/components/ui";
import { FormModal } from "../src/components/form-modal";
import type { ContentEntry } from "@/lib/types";
import { ALL_FILTER } from "@/lib/i18n/types";

type FormState = {
  id?: string;
  title: string;
  category: string;
  body: string;
  tags: string;
};

const emptyForm: FormState = { title: "", category: "", body: "", tags: "" };

export default function LibraryScreen() {
  const c = useColors();
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { run, busy } = useMutate();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL_FILTER);
  const [form, setForm] = useState<FormState | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const entriesQ = useApi(
    (config) =>
      api.library(config, {
        q: search || undefined,
        category: category !== ALL_FILTER ? category : undefined,
      }),
    [search, category]
  );

  useEffect(() => {
    if (params.add === "entry" || params.add === "1") {
      setForm(emptyForm);
      router.setParams({ add: "" });
    }
  }, [params.add, router]);

  const entries = entriesQ.data ?? [];
  const categories = useMemo(
    () => Array.from(new Set(entries.map((e) => e.category))).sort(),
    [entries]
  );

  async function submit() {
    if (!form || !form.title.trim() || !form.body.trim()) return;
    const body = { title: form.title, category: form.category, body: form.body, tags: form.tags };
    if (form.id) await run((config) => api.updateEntry(config, form.id!, body), { success: "flash.entryUpdated" });
    else await run((config) => api.createEntry(config, body), { success: "flash.entryAdded" });
    setForm(null);
    entriesQ.refresh();
  }

  function removeEntry(entry: ContentEntry) {
    confirmDelete(
      `${t("library.deleteEntry")}: ${entry.title}?`,
      async () => {
        await run((config) => api.deleteEntry(config, entry.id), { success: "flash.entryDeleted" });
        setForm(null);
        entriesQ.refresh();
      },
      t("common.delete"),
      t("common.cancel")
    );
  }

  return (
    <Screen
      title={t("library.title")}
      subtitle={t("library.subtitle")}
      refreshing={entriesQ.loading}
      onRefresh={entriesQ.refresh}
      headerRight={<Btn small label={t("library.addEntry")} onPress={() => setForm(emptyForm)} />}
    >
      <Input value={search} onChangeText={setSearch} placeholder={t("library.searchPlaceholder")} />
      {categories.length > 0 ? (
        <Row wrap style={{ marginBottom: 12 }}>
          <Chip label={t("library.allCategories")} active={category === ALL_FILTER} onPress={() => setCategory(ALL_FILTER)} />
          {categories.map((cat) => (
            <Chip key={cat} label={cat} active={category === cat} onPress={() => setCategory(cat)} />
          ))}
        </Row>
      ) : null}

      {entriesQ.error ? <ErrorNote message={entriesQ.error} onRetry={entriesQ.refresh} /> : null}
      {entriesQ.loading && !entriesQ.data ? <Loading /> : null}
      {entriesQ.data && entries.length === 0 ? <EmptyState text={t("library.noResults")} /> : null}

      {entries.map((entry) => {
        const open = expanded === entry.id;
        return (
          <Card key={entry.id}>
            <Pressable onPress={() => setExpanded(open ? null : entry.id)}>
              <Row>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.ink, fontWeight: "700", textAlign: "right" }}>{entry.title}</Text>
                  <Row style={{ justifyContent: "flex-start", marginTop: 4 }} wrap>
                    <Badge label={entry.category} tone="accent" />
                    {entry.tags.map((tag) => (
                      <Badge key={tag} label={tag} />
                    ))}
                  </Row>
                </View>
              </Row>
              <Text
                style={{ color: c.muted, fontSize: tokens.textSm, lineHeight: 20, textAlign: "right", marginTop: 6 }}
                numberOfLines={open ? undefined : 3}
              >
                {entry.body}
              </Text>
            </Pressable>
            {open ? (
              <Row style={{ marginTop: 8 }}>
                <Btn
                  small
                  variant="ghost"
                  label={t("common.edit")}
                  onPress={() =>
                    setForm({
                      id: entry.id,
                      title: entry.title,
                      category: entry.category,
                      body: entry.body,
                      tags: entry.tags.join(", "),
                    })
                  }
                />
                <Btn small variant="warn" label={t("common.delete")} onPress={() => removeEntry(entry)} />
              </Row>
            ) : null}
          </Card>
        );
      })}

      <FormModal
        visible={form !== null}
        title={form?.id ? t("common.edit") : t("library.addEntry")}
        onClose={() => setForm(null)}
        onSubmit={submit}
        submitLabel={form?.id ? t("common.save") : t("common.add")}
        busy={busy}
        onDelete={
          form?.id
            ? () => {
                const entry = entries.find((x) => x.id === form.id);
                if (entry) removeEntry(entry);
              }
            : undefined
        }
        deleteLabel={t("library.deleteEntry")}
      >
        {form ? (
          <View>
            <Input value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder={t("library.entryTitle")} />
            <Input value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} placeholder={t("library.categoryPlaceholder")} />
            <Input value={form.tags} onChangeText={(v) => setForm({ ...form, tags: v })} placeholder={t("library.tagsPlaceholder")} />
            <Input
              value={form.body}
              onChangeText={(v) => setForm({ ...form, body: v })}
              placeholder={t("library.bodyPlaceholder")}
              multiline
              style={{ minHeight: 120, textAlignVertical: "top" }}
            />
          </View>
        ) : null}
      </FormModal>
    </Screen>
  );
}
