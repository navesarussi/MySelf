export type TaskSourceId = "google_tasks" | "monday" | "github";

export type ExternalTaskDraft = {
  externalId: string;
  externalListId: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  status: "open" | "done";
  meta: {
    listTitle?: string;
    deepLink?: string;
    parentExternalId?: string;
    account_key?: string;
    account_name?: string;
    statusColumnId?: string;
    statusLabel?: string;
  };
};

export type TaskSourceCapabilities = {
  pullOpen: true;
  writeStatus: boolean;
  listPicker: boolean;
};

export interface TaskSourceProvider {
  id: TaskSourceId;
  capabilities: TaskSourceCapabilities;
  listSources(): Promise<{ id: string; title: string }[]>;
  pullOpenTasks(selectedListIds: string[]): Promise<ExternalTaskDraft[]>;
  complete(externalId: string, listId: string): Promise<void>;
  reopen(
    externalId: string,
    listId: string,
    meta?: { statusLabel?: string }
  ): Promise<void>;
}
