import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useColors, tokens } from "../theme";
import { useI18n } from "../i18n";
import { useLayoutDir } from "../layout-dir";
import { Btn, Row } from "./ui";

/** Bottom-sheet style modal used by every add/edit form in the app. */
export function FormModal({
  visible,
  title,
  onClose,
  onSubmit,
  submitLabel,
  busy,
  children,
  onDelete,
  deleteLabel,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  busy?: boolean;
  children: React.ReactNode;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  const c = useColors();
  const { t } = useI18n();
  const { textStart, writingDirection } = useLayoutDir();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            borderColor: c.border,
            borderWidth: 1,
            maxHeight: "85%",
          }}
        >
          <ScrollView contentContainerStyle={{ padding: tokens.padLg }}>
            <Text
              style={{
                color: c.ink,
                fontSize: 17,
                fontWeight: "700",
                textAlign: textStart, writingDirection,
                marginBottom: 12,
              }}
            >
              {title}
            </Text>
            {children}
            <Row style={{ marginTop: 12 }}>
              <Btn label={submitLabel} onPress={onSubmit} disabled={busy} />
              <Btn label={t("common.cancel")} variant="ghost" onPress={onClose} />
              <View style={{ flex: 1 }} />
              {onDelete ? (
                <Btn label={deleteLabel ?? t("common.delete")} variant="warn" onPress={onDelete} />
              ) : null}
            </Row>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
