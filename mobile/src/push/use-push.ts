import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useSession } from "../session";
import { registerPushToken } from "./register";

const ALLOWED_SCREENS = new Set([
  "/",
  "/habits",
  "/relationships",
  "/tasks",
  "/timeline",
  "/settings",
  "/goals",
  "/library",
]);

function screenFromData(data: Record<string, unknown> | undefined): string | null {
  const raw = data?.screen;
  if (typeof raw !== "string") return null;
  const screen = raw.startsWith("/") ? raw : `/${raw}`;
  return ALLOWED_SCREENS.has(screen) ? screen : null;
}

/** Registers push token after login and navigates on notification tap. */
export function usePushNotifications() {
  const { token, serverUrl, ready } = useSession();
  const router = useRouter();
  const registered = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !token || Platform.OS === "web") return;

    let cancelled = false;

    async function sync() {
      try {
        const pushToken = await registerPushToken({ token: token!, serverUrl });
        if (!cancelled && pushToken) registered.current = pushToken;
      } catch {
        // Permission denied or network — ignore
      }
    }

    void sync();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync();
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [ready, token, serverUrl]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const screen = screenFromData(data);
      if (screen) router.push(screen as `/${string}`);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      const screen = screenFromData(data);
      if (screen) router.push(screen as `/${string}`);
    });

    return () => responseSub.remove();
  }, [router]);
}
