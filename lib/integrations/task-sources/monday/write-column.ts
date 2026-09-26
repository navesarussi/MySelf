import { mondayGraphql, MondayGraphqlError } from "./graphql";

export function isMondayPermissionError(err: unknown): boolean {
  if (!(err instanceof MondayGraphqlError)) return false;
  if (err.graphqlStatusCodes.includes(403)) return true;
  return err.graphqlCodes.some(
    (c) => c === "UserUnauthorizedException" || c.toLowerCase().includes("unauthorized")
  );
}

async function changeStatusByMultipleColumns(
  accessToken: string,
  boardId: string,
  itemId: string,
  columnId: string,
  labelIndex: number
) {
  await mondayGraphql(
    accessToken,
    `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(
        board_id: $boardId
        item_id: $itemId
        column_values: $columnValues
      ) { id }
    }`,
    {
      boardId,
      itemId,
      columnValues: JSON.stringify({ [columnId]: { index: labelIndex } }),
    }
  );
}

async function changeStatusByIndex(
  accessToken: string,
  boardId: string,
  itemId: string,
  columnId: string,
  labelIndex: number
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
    { boardId, itemId, columnId, value: String(labelIndex) }
  );
}

async function changeStatusByLabel(
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

/** Try Monday's recommended multi-column JSON mutation, then simple index, then label text. */
export async function mutateMondayStatusColumn(
  accessToken: string,
  boardId: string,
  itemId: string,
  columnId: string,
  labelIndex: number,
  labelText?: string | null
): Promise<void> {
  const attempts: Array<() => Promise<void>> = [
    () => changeStatusByMultipleColumns(accessToken, boardId, itemId, columnId, labelIndex),
    () => changeStatusByIndex(accessToken, boardId, itemId, columnId, labelIndex),
  ];
  if (labelText) {
    attempts.push(() => changeStatusByLabel(accessToken, boardId, itemId, columnId, labelText));
  }

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch (err) {
      lastErr = err;
      if (!(err instanceof MondayGraphqlError)) throw err;
    }
  }
  throw lastErr;
}

export async function archiveMondayItem(accessToken: string, itemId: string) {
  await mondayGraphql(
    accessToken,
    `mutation ($itemId: ID!) {
      archive_item(item_id: $itemId) { id }
    }`,
    { itemId }
  );
}
