"use client";

import { inputClass } from "@/components/ui";
import { useTranslations } from "@/components/locale-provider";

export function NotesForm({
  id,
  defaultNotes,
  action,
}: {
  id: string;
  defaultNotes: string;
  action: (formData: FormData) => void;
}) {
  const { t } = useTranslations();

  return (
    <form action={action} className="mt-1">
      <input type="hidden" name="id" value={id} />
      <textarea
        name="notes"
        defaultValue={defaultNotes}
        placeholder={t("relationships.notesPlaceholder")}
        rows={1}
        className={`${inputClass} min-h-[2rem] text-xs`}
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  );
}
