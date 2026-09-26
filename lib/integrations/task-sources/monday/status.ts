import { reportIntegrationError } from "@/lib/error-reporting";
import { isExpectedMondayWritebackError } from "../writeback-errors";
import { pickDoneLabelIndex, pickReopenLabelIndex } from "./map";
import type { MondayStatusLabelOption } from "./types";
import { fetchBoardMeta, fetchMondayItemWritebackContext } from "./fetch";
import { getIntegrationToken } from "../../tokens";
import { MONDAY_PROVIDER } from "../../monday-config";
import { parseMondayExternalId } from "./ids";
import { MondayGraphqlError } from "./graphql";
import { assertMondayWriteScope } from "./scopes";
import {
  archiveMondayItem,
  isMondayPermissionError,
  mutateMondayStatusColumn,
} from "./write-column";

function reportMondayFailure(action: string, err: unknown, context: Record<string, string>) {
  if (isExpectedMondayWritebackError(err)) {
    console.warn("[monday-writeback]", action, err instanceof Error ? err.message : err, context);
    return;
  }
  reportIntegrationError("monday", err, {
    route: "task-writeback",
    userAction: action,
    upstreamBody:
      err instanceof MondayGraphqlError
        ? { body: err.body, messages: err.graphqlMessages, codes: err.graphqlCodes, ...context }
        : context,
  });
}

export async function getMondayAccessToken(accountKey: string): Promise<string> {
  const row = await getIntegrationToken(MONDAY_PROVIDER, accountKey);
  if (!row) throw new Error("not_connected");
  return row.access_token;
}

type ResolvedWriteback = {
  boardId: string;
  statusColumnId: string;
  statusLabels: MondayStatusLabelOption[];
  previousLabel?: string | null;
  previousIndex?: number | null;
};

async function resolveWriteback(
  accessToken: string,
  itemId: string,
  boardId: string,
  cache?: MondayWritebackCache
): Promise<ResolvedWriteback> {
  const live = await fetchMondayItemWritebackContext(accessToken, itemId, boardId);
  if (live?.statusColumnId) {
    return {
      boardId: live.boardId,
      statusColumnId: live.statusColumnId,
      statusLabels: live.statusLabels,
      previousLabel: live.statusLabel,
      previousIndex: live.statusLabelIndex,
    };
  }

  const meta = await fetchBoardMeta(accessToken, boardId);
  if (!meta) throw new Error("monday_board_not_found");
  if (!meta.statusColumnId) throw new Error("monday_no_status_column");

  const labels =
    meta.statusLabels.length > 0 ? meta.statusLabels : (cache?.statusLabels ?? []);

  return {
    boardId,
    statusColumnId: meta.statusColumnId,
    statusLabels: labels,
    previousLabel: cache?.statusLabel,
    previousIndex: cache?.statusLabelIndex,
  };
}

function labelTextForIndex(labels: MondayStatusLabelOption[], index: number): string | null {
  return labels.find((l) => l.index === index)?.label ?? null;
}

export async function completeMondayItem(
  accessToken: string,
  boardId: string,
  itemId: string,
  statusColumnId: string,
  statusLabels: MondayStatusLabelOption[]
) {
  const labelIndex = pickDoneLabelIndex(statusLabels);
  if (labelIndex == null) throw new Error("monday_no_done_label");
  const labelText = labelTextForIndex(statusLabels, labelIndex);
  try {
    await mutateMondayStatusColumn(
      accessToken,
      boardId,
      itemId,
      statusColumnId,
      labelIndex,
      labelText
    );
  } catch (err) {
    if (!isMondayPermissionError(err)) throw err;
    await archiveMondayItem(accessToken, itemId);
  }
}

export async function reopenMondayItem(
  accessToken: string,
  boardId: string,
  itemId: string,
  statusColumnId: string,
  statusLabels: MondayStatusLabelOption[],
  previousLabel?: string | null,
  previousIndex?: number | null
) {
  const labelIndex = pickReopenLabelIndex(statusLabels, previousLabel, previousIndex);
  if (labelIndex == null) throw new Error("monday_no_reopen_label");
  const labelText = previousLabel ?? labelTextForIndex(statusLabels, labelIndex);
  await mutateMondayStatusColumn(
    accessToken,
    boardId,
    itemId,
    statusColumnId,
    labelIndex,
    labelText
  );
}

type MondayWritebackCache = {
  statusColumnId?: string | null;
  statusLabels?: MondayStatusLabelOption[];
  statusLabel?: string | null;
  statusLabelIndex?: number | null;
};

export async function completeByExternalId(
  externalId: string,
  boardId: string,
  cache?: MondayWritebackCache
) {
  const { accountKey, itemId } = parseMondayExternalId(externalId);
  await assertMondayWriteScope(accountKey);
  const token = await getMondayAccessToken(accountKey);
  try {
    const resolved = await resolveWriteback(token, itemId, boardId, cache);
    await completeMondayItem(
      token,
      resolved.boardId,
      itemId,
      resolved.statusColumnId,
      resolved.statusLabels
    );
  } catch (err) {
    reportMondayFailure("complete", err, { externalId, boardId, itemId });
    throw err;
  }
}

export async function reopenByExternalId(
  externalId: string,
  boardId: string,
  previousLabel?: string | null,
  cache?: MondayWritebackCache
) {
  const { accountKey, itemId } = parseMondayExternalId(externalId);
  await assertMondayWriteScope(accountKey);
  const token = await getMondayAccessToken(accountKey);
  try {
    const resolved = await resolveWriteback(token, itemId, boardId, cache);
    await reopenMondayItem(
      token,
      resolved.boardId,
      itemId,
      resolved.statusColumnId,
      resolved.statusLabels,
      previousLabel ?? cache?.statusLabel ?? resolved.previousLabel,
      cache?.statusLabelIndex ?? resolved.previousIndex
    );
  } catch (err) {
    reportMondayFailure("reopen", err, { externalId, boardId, itemId });
    throw err;
  }
}

/** Archive upstream item — used when status change is blocked but archive succeeds. */
export async function archiveByExternalId(externalId: string, boardId: string) {
  const { accountKey, itemId } = parseMondayExternalId(externalId);
  await assertMondayWriteScope(accountKey);
  const token = await getMondayAccessToken(accountKey);
  try {
    await archiveMondayItem(token, itemId);
  } catch (err) {
    reportMondayFailure("archive", err, { externalId, boardId, itemId });
    throw err;
  }
}

export { mutateMondayStatusColumn, archiveMondayItem } from "./write-column";
