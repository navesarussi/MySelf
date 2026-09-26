import { mapMondayItem } from "./map";
import { mondayGraphql } from "./graphql";
import type { ExternalTaskDraft } from "../types";
import type {
  MondayAccountInfo,
  MondayBoardSummary,
  MondayColumn,
  MondayItem,
  MondayItemWritebackContext,
  MondayMapContext,
} from "./types";

export async function fetchMondayAccount(accessToken: string): Promise<MondayAccountInfo> {
  const data = await mondayGraphql<{
    me: { id: string; name: string; account: { id: string; name: string; slug: string } };
  }>(accessToken, `query { me { id name account { id name slug } } }`);
  return {
    id: String(data.me.account.id),
    name: data.me.account.name,
    slug: data.me.account.slug,
  };
}

export async function fetchMondayBoards(accessToken: string): Promise<MondayBoardSummary[]> {
  const data = await mondayGraphql<{ boards: { id: string; name: string }[] | null }>(
    accessToken,
    `query { boards(limit: 100, state: active) { id name } }`
  );
  return (data.boards ?? []).map((b) => ({ id: String(b.id), title: b.name }));
}

function findPeopleColumnId(columns: MondayColumn[]): string | null {
  const people = columns.find((c) => c.type === "people" || c.type === "multiple-person");
  return people?.id ?? null;
}

function findStatusColumnId(columns: MondayColumn[]): string | null {
  return columns.find((c) => c.type === "status")?.id ?? null;
}

const HEBREW_DONE_RE = /^(בוצע|הושלם|נסגר)$/i;
const EN_DONE_RE = /^(done|complete|completed)$/i;

export function parseStatusLabels(
  settingsStr: string | null | undefined
): { label: string; index: number; is_done?: boolean }[] {
  if (!settingsStr) return [];
  try {
    const settings = JSON.parse(settingsStr) as {
      labels?: Record<string, string>;
      labels_colors?: Record<string, { var_name?: string }>;
    };
    const labels = settings.labels ?? {};
    return Object.entries(labels)
      .filter(([, label]) => label.trim().length > 0)
      .map(([indexStr, label]) => {
        const index = Number(indexStr);
        const varName = settings.labels_colors?.[indexStr]?.var_name ?? "";
        const is_done =
          /done|complete|success|green/i.test(varName) ||
          EN_DONE_RE.test(label) ||
          HEBREW_DONE_RE.test(label);
        return { label, index, is_done };
      });
  } catch {
    return [];
  }
}

export async function fetchBoardMeta(accessToken: string, boardId: string) {
  const data = await mondayGraphql<{
    boards: { id: string; name: string; columns: MondayColumn[] }[] | null;
  }>(
    accessToken,
    `query ($ids: [ID!]) {
      boards(ids: $ids) {
        id name
        columns { id title type settings_str }
      }
    }`,
    { ids: [boardId] }
  );
  const board = data.boards?.[0];
  if (!board) return null;
  const columns = board.columns ?? [];
  return {
    id: String(board.id),
    title: board.name,
    columns,
    peopleColumnId: findPeopleColumnId(columns),
    statusColumnId: findStatusColumnId(columns),
    statusLabels: parseStatusLabels(columns.find((c) => c.type === "status")?.settings_str),
  };
}

async function fetchAssignedItemsPage(
  accessToken: string,
  boardId: string,
  peopleColumnId: string,
  cursor?: string
): Promise<{ items: MondayItem[]; nextCursor: string | null }> {
  const itemFields = `
    id name
    board { id }
    column_values {
      id type text
      ... on StatusValue { label is_done index }
      ... on DateValue { date }
    }`;

  if (cursor) {
    const data = await mondayGraphql<{
      next_items_page: { cursor: string | null; items: MondayItem[] };
    }>(
      accessToken,
      `query ($cursor: String!) {
        next_items_page(cursor: $cursor, limit: 50) {
          cursor items { ${itemFields} }
        }
      }`,
      { cursor }
    );
    return {
      items: data.next_items_page.items ?? [],
      nextCursor: data.next_items_page.cursor,
    };
  }

  const data = await mondayGraphql<{
    boards: { items_page: { cursor: string | null; items: MondayItem[] } }[] | null;
  }>(
    accessToken,
    `query ($ids: [ID!], $columnId: ID!) {
      boards(ids: $ids) {
        items_page(
          limit: 50
          query_params: {
            rules: [{
              column_id: $columnId
              compare_value: ["assigned_to_me"]
              operator: any_of
            }]
          }
        ) { cursor items { ${itemFields} } }
      }
    }`,
    { ids: [boardId], columnId: peopleColumnId }
  );

  const page = data.boards?.[0]?.items_page;
  return { items: page?.items ?? [], nextCursor: page?.cursor ?? null };
}

export async function fetchAssignedOpenItems(
  accessToken: string,
  boardIds: string[],
  account: MondayAccountInfo
): Promise<ExternalTaskDraft[]> {
  const drafts: ExternalTaskDraft[] = [];

  for (const boardId of boardIds) {
    const meta = await fetchBoardMeta(accessToken, boardId);
    if (!meta?.peopleColumnId) continue;

    const ctx: MondayMapContext = {
      accountKey: account.id,
      accountName: account.name,
      accountSlug: account.slug,
      boardId: meta.id,
      boardTitle: meta.title,
      statusColumnId: meta.statusColumnId,
      peopleColumnId: meta.peopleColumnId,
      statusLabels: meta.statusLabels,
    };

    let cursor: string | undefined;
    do {
      const page = await fetchAssignedItemsPage(
        accessToken,
        boardId,
        meta.peopleColumnId,
        cursor
      );
      for (const item of page.items) {
        const draft = mapMondayItem(item, ctx);
        if (draft) drafts.push(draft);
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  return drafts;
}

function statusFromItemValues(
  columnValues: MondayItem["column_values"],
  statusColumnId: string | null
) {
  if (!statusColumnId || !columnValues) {
    return { label: null as string | null, index: null as number | null, isDone: false };
  }
  const col = columnValues.find((c) => c.id === statusColumnId);
  if (!col) return { label: null, index: null, isDone: false };
  return {
    label: col.label ?? col.text ?? null,
    index: typeof col.index === "number" ? col.index : null,
    isDone: col.is_done === true,
  };
}

/** Live item + board meta for write-back — resolves subitem boards and the real status column. */
export async function fetchMondayItemWritebackContext(
  accessToken: string,
  itemId: string,
  boardIdHint: string
): Promise<MondayItemWritebackContext | null> {
  const data = await mondayGraphql<{
    items: MondayItem[] | null;
  }>(
    accessToken,
    `query ($ids: [ID!]) {
      items(ids: $ids) {
        id
        board { id }
        column_values {
          id type
          ... on StatusValue { label is_done index }
        }
      }
    }`,
    { ids: [itemId] }
  );

  const item = data.items?.[0];
  if (!item) return null;

  const boardId = item.board?.id ? String(item.board.id) : boardIdHint;
  const meta = await fetchBoardMeta(accessToken, boardId);
  if (!meta) return null;

  const status = statusFromItemValues(item.column_values, meta.statusColumnId);
  return {
    boardId,
    statusColumnId: meta.statusColumnId,
    statusLabelIndex: status.index,
    statusLabel: status.label,
    statusLabels: meta.statusLabels,
  };
}
