import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { useColors, tokens } from "./theme";
import { useLayoutDir } from "./layout-dir";

type ToastTone = "success" | "error";

type ToastContextValue = {
  show: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const { textStart } = useLayoutDir();
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<ToastTone>("success");
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (text: string, nextTone: ToastTone = "success") => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setMessage(text);
      setTone(nextTone);
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() =>
          setMessage(null)
        );
      }, 2600);
    },
    [opacity]
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 96,
            left: 16,
            right: 16,
            opacity,
            zIndex: 100,
          }}
        >
          <View
            style={{
              backgroundColor: tone === "success" ? c.good : c.warn,
              borderRadius: tokens.radius,
              paddingHorizontal: 16,
              paddingVertical: 12,
              shadowColor: "#000",
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <Text style={{ color: c.bg, fontSize: tokens.textSm, fontWeight: "600", textAlign: textStart }}>
              {message}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
