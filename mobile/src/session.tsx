import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/** Session = server URL + the site's session token (sent as a Bearer header).
 *  Token lives in SecureStore on native, localStorage on web. */

const TOKEN_KEY = "myself.session_token";
const SERVER_KEY = "myself.server_url";

const DEFAULT_SERVER = process.env.EXPO_PUBLIC_API_URL || "https://myselfapp.xyz";

async function storeGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function storeSet(key: string, value: string | null) {
  if (Platform.OS === "web") {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {}
    return;
  }
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}

type SessionValue = {
  ready: boolean;
  token: string | null;
  serverUrl: string;
  signIn: (serverUrl: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  setServerUrl: (url: string) => Promise<void>;
};

const SessionContext = createContext<SessionValue>({
  ready: false,
  token: null,
  serverUrl: DEFAULT_SERVER,
  signIn: async () => {},
  signOut: async () => {},
  setServerUrl: async () => {},
});

export function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrlState] = useState(DEFAULT_SERVER);

  useEffect(() => {
    Promise.all([storeGet(TOKEN_KEY), storeGet(SERVER_KEY)])
      .then(([storedToken, storedServer]) => {
        if (storedToken) setToken(storedToken);
        if (storedServer) setServerUrlState(storedServer);
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      token,
      serverUrl,
      signIn: async (url: string, newToken: string) => {
        const normalized = normalizeServerUrl(url);
        setServerUrlState(normalized);
        setToken(newToken);
        await storeSet(SERVER_KEY, normalized);
        await storeSet(TOKEN_KEY, newToken);
      },
      signOut: async () => {
        setToken(null);
        await storeSet(TOKEN_KEY, null);
      },
      setServerUrl: async (url: string) => {
        const normalized = normalizeServerUrl(url);
        setServerUrlState(normalized);
        await storeSet(SERVER_KEY, normalized);
      },
    }),
    [ready, token, serverUrl]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
