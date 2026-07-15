import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { apiFetch } from "./api/client";

/** Session = baked-in production API + session token in SecureStore.
 *  After first successful sign-in the device stays logged in until logout. */

const TOKEN_KEY = "myself.session_token";

export const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://myselfapp.xyz";

async function storeGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function storeSet(key: string, value: string | null) {
  if (Platform.OS === "web") {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {}
    return;
  }
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Keychain unavailable — session won't persist but app should still open.
  }
}

type SessionValue = {
  ready: boolean;
  token: string | null;
  serverUrl: string;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue>({
  ready: false,
  token: null,
  serverUrl: API_URL,
  signIn: async () => {},
  signOut: async () => {},
});

/** @deprecated kept for callers that still pass a URL — always uses API_URL */
export function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return API_URL;
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const storedToken = await storeGet(TOKEN_KEY);
      if (storedToken) {
        try {
          await apiFetch({ serverUrl: API_URL, token: storedToken }, "/session");
          setToken(storedToken);
        } catch {
          await storeSet(TOKEN_KEY, null);
        }
      }
    })().finally(() => setReady(true));
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      token,
      serverUrl: API_URL,
      signIn: async (newToken: string) => {
        await apiFetch({ serverUrl: API_URL, token: newToken }, "/session");
        setToken(newToken);
        await storeSet(TOKEN_KEY, newToken);
      },
      signOut: async () => {
        setToken(null);
        await storeSet(TOKEN_KEY, null);
      },
    }),
    [ready, token]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
