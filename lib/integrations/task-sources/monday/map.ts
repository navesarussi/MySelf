import type { ExternalTaskDraft } from "../types";
import { makeMondayExternalId } from "./ids";
import type { MondayItem, MondayMapContext, MondayStatusLabelOption } from "./types";

function statusFromItem(item: MondayItem, statusColumnId: string | null) {
  if (!statusColumnId || !item.column_values) {
    return { isDone: false, label: null as string | null, index: null as number | null };
  }
  const col = item.column_values.find((c) => c.id === statusColumnId);
  if (!col) return { isDone: false, label: null, index: null };
  return {
    isDone: col.is_done === true,
    label: col.label ?? col.text ?? null,
    index: typeof col.index === "number" ? col.index : null,
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

  const boardId = item.board?.id ? String(item.board.id) : ctx.boardId;
  const deepLink = ctx.accountSlug
    ? `https://${ctx.accountSlug}.monday.com/boards/${boardId}/pulses/${item.id}`
    : undefined;

  return {
    externalId: makeMondayExternalId(ctx.accountKey, item.id),
    externalListId: boardId,
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
      statusLabelIndex: status.index ?? undefined,
      statusLabels: ctx.statusLabels,
    },
  };
}

const DONE_LABEL_RE = /^(done|complete|completed|בוצע|הושלם|נסגר)$/i;

export function pickDoneLabel(labels: MondayStatusLabelOption[]): string | null {
  const index = pickDoneLabelIndex(labels);
  if (index == null) return null;
  return labels.find((l) => l.index === index)?.label ?? null;
}

function withFallbackIndex(labels: MondayStatusLabelOption[]): MondayStatusLabelOption[] {
  return labels.map((l, i) => ({ ...l, index: l.index ?? i }));
}

export function pickDoneLabelIndex(labels: MondayStatusLabelOption[]): number | null {
  const normalized = withFallbackIndex(labels);
  const done = normalized.filter((l) => l.is_done);
  if (done.length) {
    const preferred = done.find((l) => /^(done|complete|completed)$/i.test(l.label));
    return (preferred ?? done[0]).index ?? null;
  }
  const byText = normalized.find((l) => DONE_LABEL_RE.test(l.label));
  if (byText) return byText.index ?? null;
  if (normalized.length > 0) return normalized[normalized.length - 1]!.index ?? null;
  return null;
}

export function pickReopenLabel(
  labels: MondayStatusLabelOption[],
  previousLabel?: string | null
): string | null {
  const index = pickReopenLabelIndex(labels, previousLabel);
  if (index == null) return null;
  return labels.find((l) => l.index === index)?.label ?? null;
}

export function pickReopenLabelIndex(
  labels: MondayStatusLabelOption[],
  previousLabel?: string | null,
  previousIndex?: number | null
): number | null {
  const normalized = withFallbackIndex(labels);
  const open = normalized.filter((l) => !l.is_done);
  if (!open.length) return null;
  if (previousIndex != null) {
    const byIndex = open.find((l) => l.index === previousIndex);
    if (byIndex) return byIndex.index ?? null;
  }
  if (previousLabel) {
    const match = open.find((l) => l.label === previousLabel);
    if (match) return match.index ?? null;
  }
  return open[0].index ?? null;
}
