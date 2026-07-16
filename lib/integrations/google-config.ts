export function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI
  );
}

export function googleAuthConfigured() {
  return googleConfigured() && Boolean(process.env.AUTH_SECRET);
}

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
export const GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
export const GOOGLE_LOGIN_SCOPES = [
  "openid",
  "email",
  "profile",
  GOOGLE_CALENDAR_SCOPE,
].join(" ");
export const GOOGLE_PROVIDER = "google_calendar";
export const GOOGLE_TASKS_PROVIDER = "google_tasks";
