import React, { useEffect, useMemo, useState } from "react";
import { Linking as RNLinking, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { differenceInCalendarDays } from "date-fns";
import { api } from "../../src/api/resources";
import { useApi, useMutate, todayLocalISO } from "../../src/hooks";
import { useI18n } from "../../src/i18n";
import { useLayoutDir } from "../../src/layout-dir";
import { useColors, tokens } from "../../src/theme";
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
  confirmDelete,
} from "../../src/components/ui";
import { FormModal } from "../../src/components/form-modal";
import { whatsappUrl } from "@/lib/integrations/phone";
import type { Relationship } from "@/lib/types";
import { ALL_FILTER } from "@/lib/i18n/types";

type FormState = {
  id?: string;
  name: string;
  group_name: string;
  reminder_days: string;
  phone: string;
  notes: string;
  project_id: string;
};

const emptyForm = (projectId: string): FormState => ({
  name: "",
  group_name: "",
  reminder_days: "",
  phone: "",
  notes: "",
  project_id: projectId,
});

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
  const { textStart, textLtr } = useLayoutDir();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { run, busy } = useMutate();
  const [groupFilter, setGroupFilter] = useState<string>(ALL_FILTER);
  const [form, setForm] = useState<FormState | null>(null);

  const relQ = useApi(api.relationships);
  const projectsQ = useApi(api.projects);
  const projects = projectsQ.data ?? [];
  const defaultProjectId = useMemo(
    () => projects.find((p) => p.name === "כללי")?.id ?? projects[0]?.id ?? "",
    [projects]
  );

  useEffect(() => {
    if ((params.add === "contact" || params.add === "1") && projects.length) {
      setForm(emptyForm(defaultProjectId));
      router.setParams({ add: "" });
    }
  }, [params.add, projects.length, defaultProjectId, router]);

  const today = new Date();
  const relationships = relQ.data ?? [];
  const groups = useMemo(
    () => Array.from(new Set(relationships.map((r) => r.group_name).filter((g): g is string => !!g))).sort(),
    [relationships]
  );

  // Urgency first (overdue, then longest since contact), like the web default sort
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

  async function contactedToday(r: Relationship) {
    await run((config) => api.updateRelationship(config, r.id, { last_contact_date: todayLocalISO() }), {
      success: "flash.contactUpdated",
    });
    relQ.refresh();
  }

  async function submit() {
    if (!form || !form.name.trim() || !form.project_id) return;
    const body = {
      name: form.name,
      group_name: form.group_name || null,
      reminder_days: form.reminder_days ? Number(form.reminder_days) : null,
      phone: form.phone || null,
      notes: form.notes || null,
      project_id: form.project_id,
    };
    if (form.id) await run((config) => api.updateRelationship(config, form.id!, body), { success: "flash.relationshipUpdated" });
    else await run((config) => api.createRelationship(config, body), { success: "flash.relationshipAdded" });
    setForm(null);
    relQ.refresh();
  }

  function removeRelationship(r: Relationship) {
    confirmDelete(
      `${t("common.delete")}: ${r.name}?`,
      async () => {
        await run((config) => api.deleteRelationship(config, r.id), { success: "flash.relationshipDeleted" });
        setForm(null);
        relQ.refresh();
      },
      t("common.delete"),
      t("common.cancel")
    );
  }

  return (
    <Screen
      title={t("relationships.title")}
      subtitle={t("relationships.subtitle")}
      refreshing={relQ.loading}
      onRefresh={relQ.refresh}
      headerRight={
        <Btn small label={`+ ${t("relationships.addContact")}`} onPress={() => setForm(emptyForm(defaultProjectId))} />
      }
    >
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
      {relQ.data && filtered.length === 0 ? <EmptyState text={t("relationships.empty")} /> : null}

      {filtered.map((r) => {
        const days = daysSince(r, today);
        const overdue = isOverdue(r, today);
        const wa = r.phone ? whatsappUrl(r.phone) : null;
        return (
          <Card key={r.id} style={overdue ? { borderColor: c.warn } : undefined}>
            <Row>
              <Pressable
                style={{ flex: 1 }}
                onPress={() =>
                  setForm({
                    id: r.id,
                    name: r.name,
                    group_name: r.group_name ?? "",
                    reminder_days: r.reminder_days != null ? String(r.reminder_days) : "",
                    phone: r.phone ?? "",
                    notes: r.notes ?? "",
                    project_id: r.project_id,
                  })
                }
              >
                <Row style={{ justifyContent: "flex-start" }} wrap>
                  <Text style={{ color: c.ink, fontWeight: "700", textAlign: textStart }}>{r.name}</Text>
                  {r.group_name ? <Badge label={r.group_name} /> : null}
                </Row>
                <Text
                  style={{
                    color: overdue ? c.warn : c.muted,
                    fontSize: tokens.textXs,
                    textAlign: textStart,
                    marginTop: 2,
                  }}
                >
                  {days === null ? t("relationships.noContactLogged") : t("relationships.lastContactDays", { days })}
                </Text>
                {r.notes ? (
                  <Text style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart, marginTop: 4 }}>
                    {r.notes}
                  </Text>
                ) : null}
              </Pressable>
            </Row>
            <Row style={{ marginTop: 10 }}>
              <Btn small label={t("relationships.contactedToday")} onPress={() => contactedToday(r)} disabled={busy} />
              {wa ? (
                <Btn small variant="ghost" label={t("common.whatsapp")} onPress={() => RNLinking.openURL(wa)} />
              ) : null}
            </Row>
          </Card>
        );
      })}

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
            <Input value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder={t("relationships.namePlaceholder")} />
            <Input
              value={form.group_name}
              onChangeText={(v) => setForm({ ...form, group_name: v })}
              placeholder={t("relationships.groupPlaceholder")}
            />
            <Input
              value={form.reminder_days}
              onChangeText={(v) => setForm({ ...form, reminder_days: v })}
              placeholder={t("relationships.reminderPlaceholder")}
              keyboardType="numeric"
            />
            <Input
              value={form.phone}
              onChangeText={(v) => setForm({ ...form, phone: v })}
              placeholder={t("relationships.phonePlaceholder")}
              keyboardType="phone-pad"
              style={{ textAlign: textLtr }}
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
    </Screen>
  );
}
