import * as Haptics from "expo-haptics";

export function hapticImpact() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticSelection() {
  Haptics.selectionAsync().catch(() => {});
}
