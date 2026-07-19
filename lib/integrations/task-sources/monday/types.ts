export type MondayAccountInfo = {
  id: string;
  name: string;
  slug: string;
};

export type MondayBoardSummary = {
  id: string;
  title: string;
};

export type MondayStatusValue = {
  id: string;
  label: string | null;
  is_done: boolean | null;
  text?: string | null;
};

export type MondayDateValue = {
  id: string;
  date: string | null;
};

export type MondayColumnValue = {
  id: string;
  type: string;
  text?: string | null;
  label?: string | null;
  is_done?: boolean | null;
  date?: string | null;
};

export type MondayColumn = {
  id: string;
  title: string;
  type: string;
  settings_str?: string | null;
};

export type MondayItem = {
  id: string;
  name: string;
  column_values?: MondayColumnValue[];
};

export type MondayMapContext = {
  accountKey: string;
  accountName: string;
  accountSlug: string;
  boardId: string;
  boardTitle: string;
  statusColumnId: string | null;
  peopleColumnId: string | null;
};
