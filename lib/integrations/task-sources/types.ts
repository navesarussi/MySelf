export type TaskSourceId = "google_tasks" | "monday" | "github";

export type StatusLabelOption = { label: string; index?: number; is_done?: boolean };

export type ExternalTaskDraft = {
  externalId: string;
  externalListId: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  status: "open" | "done";
  meta: {
    listTitle?: string;
    listId?: string;
    deepLink?: string;
    parentExternalId?: string;
    account_key?: string;
    account_name?: string;
    statusColumnId?: string;
    statusLabel?: string;
    statusLabelIndex?: number;
    statusLabels?: StatusLabelOption[];
  };
};

export type TaskWritebackOpts = {
  statusLabel?: string | null;
  statusLabelIndex?: number | null;
  statusLabels?: StatusLabelOption[];
  statusColumnId?: string | null;
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
  complete(externalId: string, listId: string, opts?: TaskWritebackOpts): Promise<void>;
  reopen(externalId: string, listId: string, opts?: TaskWritebackOpts): Promise<void>;
}
