import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import type { ApiConfig } from "../api/client";
import { api } from "../api/resources";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== "granted") return null;

  const id = projectId();
  if (!id) return null;

  const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
  return token.data;
}

export async function registerPushToken(config: ApiConfig): Promise<string | null> {
  const token = await getExpoPushToken();
  if (!token) return null;
  await api.registerPushToken(config, {
    expo_push_token: token,
    platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web",
    device_id: Device.modelName ?? null,
  });
  return token;
}

export async function unregisterPushToken(config: ApiConfig): Promise<void> {
  try {
    const token = await getExpoPushToken();
    if (!token) return;
    await api.unregisterPushToken(config, token);
  } catch {
    // Best-effort on logout
  }
}
