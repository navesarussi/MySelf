import React from "react";
import { Text, View } from "react-native";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";
import { Btn, Card } from "./ui";

type BoundaryProps = {
  children: React.ReactNode;
  /** Label for console logging (screen or widget name). */
  name?: string;
  /** When true, use compact card styling for section widgets. */
  compact?: boolean;
  onRetry?: () => void;
};

type State = { error: Error | null; retryKey: number };

function logBoundaryError(name: string | undefined, error: Error, info: React.ErrorInfo) {
  const label = name ? `[ErrorBoundary:${name}]` : "[ErrorBoundary]";
  console.error(label, error.message, error.stack);
  if (info.componentStack) {
    console.error(`${label} component stack`, info.componentStack);
  }
}

export class ErrorBoundary extends React.Component<BoundaryProps, State> {
  state: State = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logBoundaryError(this.props.name, error, info);
  }

  reset = () => {
    this.props.onRetry?.();
    this.setState((s) => ({ error: null, retryKey: s.retryKey + 1 }));
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <CrashScreen
        message={this.state.error.message}
        compact={this.props.compact}
        onRetry={this.reset}
      />
    );
  }
}

/** Per-screen boundary: isolates tab content while navigation chrome keeps working. */
export function ScreenErrorBoundary({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const [retryKey, setRetryKey] = React.useState(0);
  return (
    <ErrorBoundary
      key={retryKey}
      name={name}
      onRetry={() => setRetryKey((k) => k + 1)}
    >
      {children}
    </ErrorBoundary>
  );
}

/** Per-widget boundary for home dashboard sections. */
export function WidgetErrorBoundary({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const [retryKey, setRetryKey] = React.useState(0);
  return (
    <ErrorBoundary
      key={retryKey}
      name={name}
      compact
      onRetry={() => setRetryKey((k) => k + 1)}
    >
      {children}
    </ErrorBoundary>
  );
}

function CrashScreen({
  message,
  compact,
  onRetry,
}: {
  message: string;
  compact?: boolean;
  onRetry?: () => void;
}) {
  const c = useColors();
  const { t } = useI18n();
  const { writingDirection, textStart, alignStart } = useLayoutDir();

  if (compact) {
    return (
      <Card style={{ borderColor: c.warn, marginBottom: 10 }}>
        <Text
          style={{
            color: c.warn,
            fontSize: tokens.textSm,
            fontWeight: "700",
            textAlign: textStart,
            writingDirection,
          }}
        >
          {t("common.error")}
        </Text>
        {__DEV__ && message ? (
          <Text
            style={{
              color: c.muted,
              fontSize: tokens.textXs,
              marginTop: 4,
              textAlign: textStart,
              writingDirection,
            }}
          >
            {message}
          </Text>
        ) : null}
        {onRetry ? (
          <View style={{ marginTop: 8, alignSelf: alignStart }}>
            <Btn small variant="ghost" label={t("common.retry")} onPress={onRetry} />
          </View>
        ) : null}
      </Card>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: "center", padding: 24 }}>
      <Text
        style={{
          color: c.ink,
          fontSize: tokens.title,
          fontWeight: "700",
          textAlign: "center",
          writingDirection,
        }}
      >
        {t("common.error")}
      </Text>
      {__DEV__ && message ? (
        <Text
          style={{
            color: c.muted,
            fontSize: tokens.text,
            textAlign: "center",
            marginTop: 12,
            writingDirection,
          }}
        >
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <View style={{ marginTop: 20, alignSelf: "center" }}>
          <Btn label={t("common.retry")} onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}
