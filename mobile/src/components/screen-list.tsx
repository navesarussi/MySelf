import React from "react";
import {
  FlatList,
  RefreshControl,
  Text,
  View,
  type FlatListProps,
  type ListRenderItem,
} from "react-native";
import { useColors, tokens } from "../theme";
import { useLayoutDir } from "../layout-dir";

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
  ListEmptyComponent?: React.ReactElement | null;
  ListFooterComponent?: React.ReactElement | null;
  contentContainerStyle?: FlatListProps<T>["contentContainerStyle"];
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
  contentContainerStyle,
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
    <FlatList
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[
        { padding: tokens.padLg, paddingBottom: 48 },
        contentContainerStyle,
      ]}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={header}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={ListFooterComponent}
      keyboardShouldPersistTaps="handled"
      windowSize={7}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      removeClippedSubviews={true}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} />
        ) : undefined
      }
    />
  );
}
