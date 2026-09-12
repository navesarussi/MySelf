import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, type HomePayload } from "../../src/api/resources";
import { useSession } from "../../src/session";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import { useColors, tokens } from "../../src/theme";
import {
  useApiQuery,
  useApiMutation,
  queryKeys,
  queryClient,
  patchItemInList,
  removeItemFromList,
  patchLibraryEntryInHome,
  removeLibraryEntryFromHome,
} from "../../src/query";
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
  ScreenList,
  confirmDelete,
} from "../../src/components/ui";
import { FormModal } from "../../src/components/form-modal";
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
  const { token, serverUrl } = useSession();
  const { textStart, textLtr, writingDirection } = useLayoutDir();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { run, busy, isPending } = useApiMutation();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL_FILTER);
  const [form, setForm] = useState<FormState | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const activeParams = useMemo(
    () => ({
      q: debouncedSearch.trim() || undefined,
      category: category !== ALL_FILTER ? category : undefined,
    }),
    [debouncedSearch, category]
  );

  const libraryKey = useMemo(() => queryKeys.library(activeParams), [activeParams]);
  const entriesQ = useApiQuery(libraryKey, (config) => api.library(config, activeParams));

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

  const submit = useCallback(async () => {
    if (!form || !form.title.trim() || !form.body.trim()) return;
    const body = { title: form.title, category: form.category, body: form.body, tags: form.tags };
    const targetId = form.id;
    setForm(null);

    if (targetId) {
      await run((config) => api.updateEntry(config, targetId, body), {
        itemId: targetId,
        flash: { success: "flash.entryUpdated" },
        onSuccess: (updated) => {
          if (updated) {
            queryClient.setQueryData<ContentEntry[]>(libraryKey, (old) =>
              patchItemInList(old, targetId, updated)
            );
            queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
              patchLibraryEntryInHome(old, targetId, {
                title: updated.title,
                category: updated.category,
                tags: updated.tags,
                updated_at: updated.updated_at,
              })
            );
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.libraryAll });
        },
      });
    } else {
      await run((config) => api.createEntry(config, body), {
        flash: { success: "flash.entryAdded" },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.libraryAll });
          queryClient.invalidateQueries({ queryKey: queryKeys.home });
        },
      });
    }
  }, [form, libraryKey, run]);

  const removeEntry = useCallback(
    (entry: ContentEntry) => {
      confirmDelete(
        `${t("library.deleteEntry")}: ${entry.title}?`,
        async () => {
          const prevEntries = queryClient.getQueryData<ContentEntry[]>(libraryKey);
          const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
          queryClient.setQueryData<ContentEntry[]>(libraryKey, (old) =>
            removeItemFromList(old, entry.id)
          );
          queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
            removeLibraryEntryFromHome(old, entry.id)
          );
          setForm(null);

          await run((config) => api.deleteEntry(config, entry.id), {
            itemId: entry.id,
            flash: { success: "flash.entryDeleted" },
            onError: () => {
              if (prevEntries) queryClient.setQueryData(libraryKey, prevEntries);
              if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
            },
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: queryKeys.libraryAll });
            },
          });
        },
        t("common.delete"),
        t("common.cancel")
      );
    },
    [libraryKey, run, t]
  );

  const openEdit = useCallback(
    async (entry: ContentEntry) => {
      if (!token || !serverUrl) return;
      try {
        const full = await queryClient.fetchQuery({
          queryKey: queryKeys.libraryEntry(entry.id),
          queryFn: () => api.getEntry({ token, serverUrl }, entry.id),
        });
        setForm({
          id: full.id,
          title: full.title,
          category: full.category,
          body: full.body,
          tags: full.tags.join(", "),
        });
      } catch {
        setForm({
          id: entry.id,
          title: entry.title,
          category: entry.category,
          body: entry.body,
          tags: entry.tags.join(", "),
        });
      }
    },
    [token, serverUrl]
  );

  const renderItem = useCallback(
    ({ item: entry }: { item: ContentEntry }) => {
      const open = expanded === entry.id;
      return (
        <Card key={entry.id}>
          <Pressable
            unstable_pressDelay={0}
            onPress={() => setExpanded(open ? null : entry.id)}
          >
            <Row>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.ink, fontWeight: "700", textAlign: textStart, writingDirection }}>
                  {entry.title}
                </Text>
                <Row style={{ justifyContent: "flex-start", marginTop: 4 }} wrap>
                  <Badge label={entry.category} tone="accent" />
                  {entry.tags.map((tag) => (
                    <Badge key={tag} label={tag} />
                  ))}
                </Row>
              </View>
            </Row>
            <Text
              style={{
                color: c.muted,
                fontSize: tokens.textSm,
                lineHeight: 20,
                textAlign: textStart,
                writingDirection,
                marginTop: 6,
              }}
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
                onPress={() => void openEdit(entry)}
              />
              <Btn
                small
                variant="warn"
                label={t("common.delete")}
                onPress={() => removeEntry(entry)}
                disabled={isPending(entry.id)}
              />
            </Row>
          ) : null}
        </Card>
      );
    },
    [expanded, c, textStart, writingDirection, t, isPending, removeEntry, openEdit]
  );

  const keyExtractor = useCallback((item: ContentEntry) => item.id, []);

  const headerExtra = useMemo(
    () => (
      <View>
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
      </View>
    ),
    [search, t, categories, category, entriesQ.error, entriesQ.loading, entriesQ.data, entriesQ.refresh]
  );

  return (
    <>
      <ScreenList
        title={t("library.title")}
        subtitle={t("library.subtitle")}
        refreshing={entriesQ.loading}
        onRefresh={entriesQ.refresh}
        headerRight={<Btn small label={t("library.addEntry")} onPress={() => setForm(emptyForm)} />}
        headerExtra={headerExtra}
        data={entries}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={entriesQ.data && entries.length === 0 ? <EmptyState text={t("library.noResults")} /> : null}
      />

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
    </>
  );
}
