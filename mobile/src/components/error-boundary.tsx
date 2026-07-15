import React from "react";
import { Text, View } from "react-native";
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
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: "center", padding: 24 }}>
      <Text style={{ color: c.ink, fontSize: tokens.title, fontWeight: "700", textAlign: "center" }}>
        משהו השתבש
      </Text>
      <Text style={{ color: c.muted, fontSize: tokens.text, textAlign: "center", marginTop: 12 }}>
        {message}
      </Text>
    </View>
  );
}
