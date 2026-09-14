import React from "react";
import { Text, View } from "react-native";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { useColors, tokens } from "../theme";

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <CrashScreen message={this.state.error.message} />;
  }
}

function CrashScreen({ message }: { message: string }) {
  const c = useColors();
  const { t } = useI18n();
  const { writingDirection } = useLayoutDir();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: "center", padding: 24 }}>
      <Text style={{ color: c.ink, fontSize: tokens.title, fontWeight: "700", textAlign: "center", writingDirection }}>
        {t("common.error")}
      </Text>
      <Text style={{ color: c.muted, fontSize: tokens.text, textAlign: "center", marginTop: 12, writingDirection }}>
        {message}
      </Text>
    </View>
  );
}
