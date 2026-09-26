import type { ExternalTaskDraft } from "../types";
import { makeMondayExternalId } from "./ids";
import type { MondayItem, MondayMapContext } from "./types";

function statusFromItem(item: MondayItem, statusColumnId: string | null) {
  if (!statusColumnId || !item.column_values) {
    return { isDone: false, label: null as string | null };
  }
  const col = item.column_values.find((c) => c.id === statusColumnId);
  if (!col) return { isDone: false, label: null as string | null };
  return {
    isDone: col.is_done === true,
    label: col.label ?? col.text ?? null,
  };
}

function dueFromItem(item: MondayItem): string | null {
  const dateCol = item.column_values?.find((c) => c.type === "date" && c.date);
  if (!dateCol?.date) return null;
  const match = dateCol.date.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : dateCol.date.slice(0, 10);
}

export function mapMondayItem(
  item: MondayItem,
  ctx: MondayMapContext
): ExternalTaskDraft | null {
  if (!item.id) return null;

  const status = statusFromItem(item, ctx.statusColumnId);
  if (status.isDone) return null;

  const deepLink = ctx.accountSlug
    ? `https://${ctx.accountSlug}.monday.com/boards/${ctx.boardId}/pulses/${item.id}`
    : undefined;

  return {
    externalId: makeMondayExternalId(ctx.accountKey, item.id),
    externalListId: ctx.boardId,
    title: item.name?.trim() || "Untitled",
    notes: null,
    dueDate: dueFromItem(item),
    status: "open",
    meta: {
      listTitle: ctx.boardTitle,
      deepLink,
      account_key: ctx.accountKey,
      account_name: ctx.accountName,
      statusColumnId: ctx.statusColumnId ?? undefined,
      statusLabel: status.label ?? undefined,
      statusLabels: ctx.statusLabels,
    },
  };
}

const DONE_LABEL_RE = /^(done|complete|completed|בוצע|הושלם|נסגר)$/i;

export function pickDoneLabel(labels: { label: string; is_done?: boolean }[]): string | null {
  const done = labels.filter((l) => l.is_done);
  if (done.length) {
    const preferred = done.find((l) => /^(done|complete|completed)$/i.test(l.label));
    return (preferred ?? done[0]).label;
  }
  const byText = labels.find((l) => DONE_LABEL_RE.test(l.label));
  if (byText) return byText.label;
  return labels.length > 0 ? labels[labels.length - 1]!.label : null;
}

export function pickReopenLabel(
  labels: { label: string; is_done?: boolean }[],
  previousLabel?: string | null
): string | null {
  const open = labels.filter((l) => !l.is_done);
  if (!open.length) return null;
  if (previousLabel) {
    const match = open.find((l) => l.label === previousLabel);
    if (match) return match.label;
  }
  return open[0].label;
}
