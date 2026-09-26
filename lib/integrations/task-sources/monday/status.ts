import { mondayGraphql } from "./graphql";
import { pickDoneLabel, pickReopenLabel } from "./map";
import type { MondayStatusLabelOption } from "./types";
import { fetchBoardMeta } from "./fetch";
import { getIntegrationToken } from "../../tokens";
import { MONDAY_PROVIDER } from "../../monday-config";
import { parseMondayExternalId } from "./ids";

async function changeStatus(
  accessToken: string,
  boardId: string,
  itemId: string,
  columnId: string,
  label: string
) {
  await mondayGraphql(
    accessToken,
    `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
      change_simple_column_value(
        board_id: $boardId
        item_id: $itemId
        column_id: $columnId
        value: $value
      ) { id }
    }`,
    { boardId, itemId, columnId, value: label }
  );
}

export async function getMondayAccessToken(accountKey: string): Promise<string> {
  const row = await getIntegrationToken(MONDAY_PROVIDER, accountKey);
  if (!row) throw new Error("not_connected");
  return row.access_token;
}

export async function completeMondayItem(
  accessToken: string,
  boardId: string,
  itemId: string,
  statusColumnId: string | null,
  statusLabels: MondayStatusLabelOption[]
) {
  if (!statusColumnId) throw new Error("monday_no_status_column");
  const label = pickDoneLabel(statusLabels);
  if (!label) throw new Error("monday_no_done_label");
  await changeStatus(accessToken, boardId, itemId, statusColumnId, label);
}

export async function reopenMondayItem(
  accessToken: string,
  boardId: string,
  itemId: string,
  statusColumnId: string | null,
  statusLabels: { label: string; is_done?: boolean }[],
  previousLabel?: string | null
) {
  if (!statusColumnId) throw new Error("monday_no_status_column");
  const label = pickReopenLabel(statusLabels, previousLabel);
  if (!label) throw new Error("monday_no_reopen_label");
  await changeStatus(accessToken, boardId, itemId, statusColumnId, label);
}

type MondayWritebackCache = {
  statusColumnId?: string | null;
  statusLabels?: MondayStatusLabelOption[];
  statusLabel?: string | null;
};

export async function completeByExternalId(
  externalId: string,
  boardId: string,
  cache?: MondayWritebackCache
) {
  const { accountKey, itemId } = parseMondayExternalId(externalId);
  const token = await getMondayAccessToken(accountKey);
  const meta = await fetchBoardMeta(token, boardId);
  if (!meta) throw new Error("monday_board_not_found");
  const labels =
    cache?.statusLabels?.length ? cache.statusLabels : meta.statusLabels;
  const columnId = cache?.statusColumnId ?? meta.statusColumnId;
  await completeMondayItem(token, boardId, itemId, columnId, labels);
}

export async function reopenByExternalId(
  externalId: string,
  boardId: string,
  previousLabel?: string | null,
  cache?: MondayWritebackCache
) {
  const { accountKey, itemId } = parseMondayExternalId(externalId);
  const token = await getMondayAccessToken(accountKey);
  const meta = await fetchBoardMeta(token, boardId);
  if (!meta) throw new Error("monday_board_not_found");
  const labels =
    cache?.statusLabels?.length ? cache.statusLabels : meta.statusLabels;
  const columnId = cache?.statusColumnId ?? meta.statusColumnId;
  await reopenMondayItem(
    token,
    boardId,
    itemId,
    columnId,
    labels,
    previousLabel ?? cache?.statusLabel
  );
}
