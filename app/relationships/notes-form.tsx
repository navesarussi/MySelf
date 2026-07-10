"use client";

import { inputClass } from "@/components/ui";

export function NotesForm({
  id,
  defaultNotes,
  action,
}: {
  id: string;
  defaultNotes: string;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="id" value={id} />
      <textarea
        name="notes"
        defaultValue={defaultNotes}
        placeholder="הערות..."
        rows={2}
        className={`${inputClass} text-xs`}
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  );
}
