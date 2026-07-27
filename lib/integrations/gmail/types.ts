export type GmailHeader = { name: string; value: string };

export type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart & { headers?: GmailHeader[] };
};

export type GmailListResponse = {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type CompactEmail = {
  id: string;
  thread_id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

export type EmailDetail = CompactEmail & {
  body: string;
};
