import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import * as Updates from "expo-updates";

/** Background OTA check — downloads compatible bundles without blocking UI or
 *  forcing an immediate reload. Downloaded updates apply on the next cold start. */
export function useExpoUpdates() {
  const checking = useRef(false);

  useEffect(() => {
    if (__DEV__ || Platform.OS === "web") return;
    if (!Updates.isEnabled) return;

    const check = async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          await Updates.fetchUpdateAsync();
        }
      } catch {
        // Non-fatal — stale bundle is better than a splash-screen loader.
      } finally {
        checking.current = false;
      }
    };

    void check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => sub.remove();
  }, []);
}
