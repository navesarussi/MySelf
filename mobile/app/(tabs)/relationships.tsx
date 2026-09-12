import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Linking as RNLinking, Platform, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Contacts from "expo-contacts";
import { differenceInCalendarDays } from "date-fns";
import { api, type HomePayload } from "../../src/api/resources";
import { todayLocalISO } from "../../src/hooks";
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
  patchRelationshipInHome,
  removeRelationshipFromHome,
} from "../../src/query";
import {
  Badge,
  Btn,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  Input,
  Label,
  Loading,
  Row,
  Screen,
  ScreenList,
  confirmDelete,
} from "../../src/components/ui";
import { FormModal } from "../../src/components/form-modal";
import { RelationshipCard } from "../../src/components/relationship-card";
import { whatsappUrl } from "@/lib/integrations/phone";
import { mapDeviceContact } from "@/lib/device-contact-map";
import type { Relationship } from "@/lib/types";
import { ALL_FILTER } from "@/lib/i18n/types";

type FormState = {
  id?: string;
  name: string;
  group_name: string;
  reminder_days: string;
  phone: string;
  email: string;
  notes: string;
  project_id: string;
  importedFromDevice?: boolean;
};

const DEFAULT_CADENCE_DAYS = "7";

const emptyForm = (projectId: string): FormState => ({
  name: "",
  group_name: "",
  reminder_days: DEFAULT_CADENCE_DAYS,
  phone: "",
  email: "",
  notes: "",
  project_id: projectId,
  importedFromDevice: false,
});

async function pickDeviceContact() {
  if (Platform.OS === "web") return null;
  try {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") return null;
    const contact = await Contacts.presentContactPickerAsync();
    if (!contact) return null;
    return mapDeviceContact(contact);
  } catch {
    return null;
  }
}

function daysSince(r: Pick<Relationship, "last_contact_date">, today: Date): number | null {
  return r.last_contact_date ? differenceInCalendarDays(today, new Date(r.last_contact_date)) : null;
}

function isOverdue(r: Relationship, today: Date): boolean {
  if (r.reminder_days == null) return false;
  const days = daysSince(r, today);
  return days === null || days >= r.reminder_days;
}

export default function RelationshipsScreen() {
  const c = useColors();
  const { t } = useI18n();
  const { textStart, textLtr, writingDirection } = useLayoutDir();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { run, isPending, busy } = useApiMutation();
  const [groupFilter, setGroupFilter] = useState<string>(ALL_FILTER);
  const [form, setForm] = useState<FormState | null>(null);

  const relQ = useApiQuery(queryKeys.relationships, api.relationships);
  const projectsQ = useApiQuery(queryKeys.projects, api.projects);
  const projects = projectsQ.data ?? [];
  const defaultProjectId = useMemo(
    () => projects.find((p) => p.name === "כללי")?.id ?? projects[0]?.id ?? "",
    [projects]
  );

  async function startCreate(projectId = defaultProjectId) {
    if (!projectId) return;
    const picked = await pickDeviceContact();
    setForm({
      ...emptyForm(projectId),
      ...(picked
        ? {
            name: picked.name,
            phone: picked.phone,
            email: picked.email,
            importedFromDevice: true,
          }
        : {}),
    });
  }

  async function importIntoForm() {
    if (!form) return;
    const picked = await pickDeviceContact();
    if (!picked) return;
    setForm({
      ...form,
      name: picked.name || form.name,
      phone: picked.phone || form.phone,
      email: picked.email || form.email,
      importedFromDevice: true,
    });
  }

  useEffect(() => {
    if ((params.add === "contact" || params.add === "1") && defaultProjectId) {
      void startCreate(defaultProjectId);
      router.setParams({ add: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.add, defaultProjectId, router]);

  const today = new Date();
  const relationships = relQ.data ?? [];
  const groups = useMemo(
    () => Array.from(new Set(relationships.map((r) => r.group_name).filter((g): g is string => !!g))).sort(),
    [relationships]
  );

  const filtered = useMemo(() => {
    const list =
      groupFilter === ALL_FILTER ? relationships : relationships.filter((r) => r.group_name === groupFilter);
    return [...list].sort((a, b) => {
      const ao = isOverdue(a, today) ? 0 : 1;
      const bo = isOverdue(b, today) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      const ad = daysSince(a, today) ?? Number.MAX_SAFE_INTEGER;
      const bd = daysSince(b, today) ?? Number.MAX_SAFE_INTEGER;
      return bd - ad;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationships, groupFilter]);

  const contactedToday = useCallback(
    async (r: Relationship) => {
      const todayISOStr = todayLocalISO();
      const prevRel = queryClient.getQueryData<Relationship[]>(queryKeys.relationships);
      const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);

      queryClient.setQueryData<Relationship[]>(queryKeys.relationships, (old) =>
        patchItemInList(old, r.id, { last_contact_date: todayISOStr })
      );
      queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
        patchRelationshipInHome(old, r.id, { last_contact_date: todayISOStr })
      );

      await run(
        (config) => api.updateRelationship(config, r.id, { last_contact_date: todayISOStr }),
        {
          itemId: r.id,
          flash: { success: "flash.contactUpdated" },
          onError: () => {
            if (prevRel) queryClient.setQueryData(queryKeys.relationships, prevRel);
            if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
          },
          onSuccess: (updated) => {
            if (updated) {
              queryClient.setQueryData<Relationship[]>(queryKeys.relationships, (old) =>
                patchItemInList(old, r.id, updated)
              );
              queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
                patchRelationshipInHome(old, r.id, updated)
              );
            }
          },
        }
      );
    },
    [run]
  );

  async function submit() {
    if (!form || !form.name.trim() || !form.project_id) return;
    const body = {
      name: form.name,
      group_name: form.group_name || null,
      reminder_days: form.reminder_days ? Number(form.reminder_days) : 7,
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
      project_id: form.project_id,
    };
    const targetId = form.id;
    setForm(null);

    if (targetId) {
      await run((config) => api.updateRelationship(config, targetId, body), {
        itemId: targetId,
        flash: {
          success: "flash.relationshipUpdated",
          error: "flash.relationshipUpdateError",
        },
        onSuccess: (updated) => {
          if (updated) {
            queryClient.setQueryData<Relationship[]>(queryKeys.relationships, (old) =>
              patchItemInList(old, targetId, updated)
            );
            queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
              patchRelationshipInHome(old, targetId, updated)
            );
          }
        },
      });
    } else {
      await run((config) => api.createRelationship(config, body), {
        flash: {
          success: "flash.relationshipAdded",
          error: "flash.relationshipAddError",
        },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.relationships });
          queryClient.invalidateQueries({ queryKey: queryKeys.home });
        },
      });
    }
  }

  function removeRelationship(r: Relationship) {
    confirmDelete(
      `${t("common.delete")}: ${r.name}?`,
      async () => {
        const prevRel = queryClient.getQueryData<Relationship[]>(queryKeys.relationships);
        const prevHome = queryClient.getQueryData<HomePayload>(queryKeys.home);
        queryClient.setQueryData<Relationship[]>(queryKeys.relationships, (old) =>
          removeItemFromList(old, r.id)
        );
        queryClient.setQueryData<HomePayload>(queryKeys.home, (old) =>
          removeRelationshipFromHome(old, r.id)
        );
        setForm(null);

        await run((config) => api.deleteRelationship(config, r.id), {
          itemId: r.id,
          flash: { success: "flash.relationshipDeleted" },
          onError: () => {
            if (prevRel) queryClient.setQueryData(queryKeys.relationships, prevRel);
            if (prevHome) queryClient.setQueryData(queryKeys.home, prevHome);
          },
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.relationships });
          },
        });
      },
      t("common.delete"),
      t("common.cancel")
    );
  }

  const handleCardPress = useCallback((r: Relationship) => {
    setForm({
      id: r.id,
      name: r.name,
      group_name: r.group_name ?? "",
      reminder_days: r.reminder_days != null ? String(r.reminder_days) : DEFAULT_CADENCE_DAYS,
      phone: r.phone ?? "",
      email: r.email ?? "",
      notes: r.notes ?? "",
      project_id: r.project_id,
      importedFromDevice: false,
    });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Relationship }) => (
      <RelationshipCard
        relationship={item}
        today={today}
        busy={isPending(item.id)}
        onPress={handleCardPress}
        onContactedToday={contactedToday}
      />
    ),
    [today, isPending, handleCardPress, contactedToday]
  );

  const keyExtractor = useCallback((item: Relationship) => item.id, []);

  const headerExtra = useMemo(
    () => (
      <View>
        {groups.length > 0 ? (
          <Row wrap style={{ marginBottom: 12 }}>
            <Chip label={t("common.all")} active={groupFilter === ALL_FILTER} onPress={() => setGroupFilter(ALL_FILTER)} />
            {groups.map((g) => (
              <Chip key={g} label={g} active={groupFilter === g} onPress={() => setGroupFilter(g)} />
            ))}
          </Row>
        ) : null}
        {relQ.error ? <ErrorNote message={relQ.error} onRetry={relQ.refresh} /> : null}
        {relQ.loading && !relQ.data ? <Loading /> : null}
      </View>
    ),
    [groups, groupFilter, t, relQ.error, relQ.loading, relQ.data, relQ.refresh]
  );

  return (
    <>
      <ScreenList
        title={t("relationships.title")}
        subtitle={t("relationships.subtitle")}
        refreshing={relQ.loading}
        onRefresh={relQ.refresh}
        headerRight={
          <Btn
            small
            label={`+ ${t("relationships.addContact")}`}
            onPress={() => void startCreate()}
            disabled={!defaultProjectId}
          />
        }
        headerExtra={headerExtra}
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={relQ.data && filtered.length === 0 ? <EmptyState text={t("relationships.empty")} /> : null}
      />

      <FormModal
        visible={form !== null}
        title={form?.id ? t("relationships.editContact") : t("relationships.addContact")}
        onClose={() => setForm(null)}
        onSubmit={submit}
        submitLabel={form?.id ? t("relationships.saveChanges") : t("common.add")}
        busy={busy}
        onDelete={
          form?.id
            ? () => {
                const r = relationships.find((x) => x.id === form.id);
                if (r) removeRelationship(r);
              }
            : undefined
        }
      >
        {form ? (
          <View>
            {Platform.OS !== "web" ? (
              <View style={{ marginBottom: 10, alignSelf: "flex-start" }}>
                <Btn
                  small
                  variant="ghost"
                  label={
                    form.importedFromDevice
                      ? t("relationships.importedChangeContact")
                      : t("relationships.importFromDevice")
                  }
                  onPress={() => void importIntoForm()}
                />
              </View>
            ) : null}
            <Input value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder={t("relationships.namePlaceholder")} />
            <Input
              value={form.group_name}
              onChangeText={(v) => setForm({ ...form, group_name: v })}
              placeholder={t("relationships.groupPlaceholder")}
            />
            <Label>{t("relationships.cadenceLabel")}</Label>
            <Input
              value={form.reminder_days}
              onChangeText={(v) => setForm({ ...form, reminder_days: v })}
              placeholder={t("relationships.cadencePlaceholder")}
              keyboardType="numeric"
            />
            <Input
              value={form.phone}
              onChangeText={(v) => setForm({ ...form, phone: v })}
              placeholder={t("relationships.phonePlaceholder")}
              keyboardType="phone-pad"
              style={form.phone ? { textAlign: textLtr } : undefined}
            />
            <Input
              value={form.email}
              onChangeText={(v) => setForm({ ...form, email: v })}
              placeholder={t("relationships.emailPlaceholder")}
              keyboardType="email-address"
              style={form.email ? { textAlign: textLtr } : undefined}
            />
            <Input
              value={form.notes}
              onChangeText={(v) => setForm({ ...form, notes: v })}
              placeholder={t("relationships.notesPlaceholder")}
              multiline
            />
            <Label>{t("nav.projects")}</Label>
            <Row wrap>
              {projects.map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  active={form.project_id === p.id}
                  onPress={() => setForm({ ...form, project_id: p.id })}
                />
              ))}
            </Row>
          </View>
        ) : null}
      </FormModal>
    </>
  );
}
