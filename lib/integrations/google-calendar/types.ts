export type GoogleCalendarEvent = {
  id: string;
  status: string;
  summary?: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string };
};

export type GoogleEventsListResponse = {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
};

export type MappedGoogleEvent = {
  google_event_id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string | null;
  category: "יומן";
  source: "google_calendar";
};
