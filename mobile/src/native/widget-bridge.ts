import { NativeModules, Platform } from "react-native";

type WidgetSnapshotBridgeModule = {
  writeSnapshot: (json: string) => Promise<void>;
  reloadTimelines: () => Promise<void>;
};

const bridge: WidgetSnapshotBridgeModule | undefined =
  Platform.OS === "ios" ? NativeModules.WidgetSnapshotBridge : undefined;

export async function writeWidgetSnapshotJson(json: string): Promise<void> {
  if (!bridge) return;
  await bridge.writeSnapshot(json);
}

export async function reloadHomeWidgetTimelines(): Promise<void> {
  if (!bridge) return;
  await bridge.reloadTimelines();
}
