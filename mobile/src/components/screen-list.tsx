import React, { type ReactElement } from "react";
import { RefreshControl, Text, View } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useColors, tokens } from "../theme";
import { useLayoutDir } from "../layout-dir";
import { ListSkeleton } from "./ui";

export type ScreenListProps<T> = {
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  headerExtra?: React.ReactNode;
  data: readonly T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  refreshing?: boolean;
  onRefresh?: () => void;
  ListEmptyComponent?: ReactElement | null;
  ListFooterComponent?: ReactElement | null;
  /** When true and data is empty, show list skeletons instead of a blank list. */
  initialLoading?: boolean;
  skeletonCount?: number;
  estimatedItemSize?: number;
  maxWidth?: number;
};

export function ScreenList<T>({
  title,
  subtitle,
  headerRight,
  headerExtra,
  data,
  renderItem,
  keyExtractor,
  refreshing,
  onRefresh,
  ListEmptyComponent,
  ListFooterComponent,
  initialLoading,
  skeletonCount = 5,
  maxWidth,
}: ScreenListProps<T>) {
  const c = useColors();
  const { textStart, writingDirection, row } = useLayoutDir();
  const showHeader = Boolean(title || subtitle || headerRight || headerExtra);

  const header = showHeader ? (
    <View style={{ marginBottom: 14 }}>
      {title || subtitle || headerRight ? (
        <View style={[row, { gap: 8, marginBottom: headerExtra ? 12 : 0 }]}>
          <View style={{ flex: 1 }}>
            {title ? (
              <Text
                style={{
                  color: c.ink,
                  fontSize: tokens.title,
                  fontWeight: "700",
                  textAlign: textStart,
                  writingDirection,
                }}
              >
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text
                style={{
                  color: c.muted,
                  fontSize: tokens.subtitle,
                  marginTop: title ? 2 : 0,
                  textAlign: textStart,
                  writingDirection,
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {headerRight}
        </View>
      ) : null}
      {headerExtra}
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, width: "100%", maxWidth, alignSelf: "center" }}>
        <FlashList
          data={data as T[]}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={header}
          ListEmptyComponent={
            initialLoading && data.length === 0 ? (
              <ListSkeleton count={skeletonCount} />
            ) : (
              ListEmptyComponent ?? null
            )
          }
          ListFooterComponent={ListFooterComponent}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: tokens.padLg, paddingBottom: 48 }}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} />
            ) : undefined
          }
        />
      </View>
    </View>
  );
}
