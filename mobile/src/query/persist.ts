import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { defaultShouldDehydrateQuery } from "@tanstack/react-query";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "myself.react-query",
});

/** Persist warm cache across cold starts; timeline events have their own store (timeline-store.ts). */
export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister,
  maxAge: 1000 * 60 * 60 * 24,
  buster: "2.6.2-finance-net",
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      if (query.queryKey[0] === "timelineEvents") return false;
      return defaultShouldDehydrateQuery(query);
    },
  },
};

