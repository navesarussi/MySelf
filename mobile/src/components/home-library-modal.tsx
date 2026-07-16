import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../api/resources";
import { useMutate } from "../hooks";
import { useI18n } from "../i18n";
import { FormModal } from "./form-modal";
import { Input, confirmDelete } from "./ui";
import type { ContentEntry } from "@/lib/types";

type LibraryForm = {
  id: string;
  title: string;
  category: string;
  body: string;
  tags: string;
};

type LibraryCard = Pick<ContentEntry, "id" | "title" | "category" | "tags" | "body">;

function toForm(entry: LibraryCard): LibraryForm {
  return {
    id: entry.id,
    title: entry.title,
    category: entry.category,
    body: entry.body,
    tags: entry.tags.join(", "),
  };
}

export function HomeLibraryModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: LibraryCard | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { run, busy } = useMutate();
  const [form, setForm] = useState<LibraryForm | null>(null);

  useEffect(() => {
    setForm(entry ? toForm(entry) : null);
  }, [entry]);

  async function submit() {
    if (!form || !form.title.trim() || !form.body.trim()) return;
    await run(
      (config) =>
        api.updateEntry(config, form.id, {
          title: form.title,
          category: form.category,
          body: form.body,
          tags: form.tags,
        }),
      { success: "flash.entryUpdated" }
    );
    onClose();
    onSaved();
  }

  function remove() {
    if (!form) return;
    confirmDelete(
      `${t("library.deleteEntry")}: ${form.title}?`,
      async () => {
        await run((config) => api.deleteEntry(config, form.id), { success: "flash.entryDeleted" });
        onClose();
        onSaved();
      },
      t("common.delete"),
      t("common.cancel")
    );
  }

  return (
    <FormModal
      visible={entry !== null}
      title={t("common.edit")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={t("common.save")}
      busy={busy}
      onDelete={form ? remove : undefined}
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
  );
}
