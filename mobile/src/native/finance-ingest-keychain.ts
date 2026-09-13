import { NativeModules, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const INGEST_TOKEN_KEY = "FINANCE_INGEST_TOKEN";

type FinanceIngestBridgeModule = {
  setIngestToken: (token: string | null) => Promise<void>;
  setSessionToken: (token: string | null) => Promise<void>;
  hasAuthToken: () => Promise<boolean>;
};

const bridge: FinanceIngestBridgeModule | undefined =
  Platform.OS === "ios" ? NativeModules.FinanceIngestBridge : undefined;

export async function syncFinanceIngestSessionToken(token: string | null): Promise<void> {
  if (!bridge) return;
  await bridge.setSessionToken(token);
}

export async function syncFinanceIngestToken(token: string | null): Promise<void> {
  if (!bridge) return;
  await bridge.setIngestToken(token);
}

export async function hasFinanceIngestAuthToken(): Promise<boolean> {
  if (!bridge) return false;
  return bridge.hasAuthToken();
}

/** Restore Keychain tokens from SecureStore after app launch or OS keychain reset. */
export async function bootstrapFinanceIngestKeychain(): Promise<void> {
  if (!bridge) return;
  try {
    const ingest = await SecureStore.getItemAsync(INGEST_TOKEN_KEY);
    await bridge.setIngestToken(ingest?.trim() || null);
  } catch {
    /* best-effort */
  }
}
