export type GoogleTaskStatus = "needsAction" | "completed";

export type GoogleTask = {
  id?: string;
  title?: string;
  notes?: string;
  status?: GoogleTaskStatus;
  due?: string;
  parent?: string;
};

export type GoogleTaskList = {
  id: string;
  title: string;
};

export type GoogleTaskListResponse = {
  items?: GoogleTaskList[];
  nextPageToken?: string;
};

export type GoogleTasksResponse = {
  items?: GoogleTask[];
  nextPageToken?: string;
};
