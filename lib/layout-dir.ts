export type LayoutEngine = {
  rtl: boolean;
  nativeSwaps: boolean;
  cssDirFollowsLocale: boolean;
};

export function rowFlexDirection(e: LayoutEngine): "row" | "row-reverse" {
  if (e.cssDirFollowsLocale) return "row";
  return e.rtl === e.nativeSwaps ? "row" : "row-reverse";
}

export function physicalTextStart(e: LayoutEngine): "left" | "right" {
  return e.rtl === e.nativeSwaps ? "left" : "right";
}

export function physicalAlignStart(e: LayoutEngine): "flex-start" | "flex-end" {
  if (e.cssDirFollowsLocale) return "flex-start";
  return e.rtl === e.nativeSwaps ? "flex-start" : "flex-end";
}

export function physicalAlignEnd(e: LayoutEngine): "flex-start" | "flex-end" {
  return physicalAlignStart(e) === "flex-start" ? "flex-end" : "flex-start";
}

export function progressAlignSelf(e: LayoutEngine): "flex-start" | "flex-end" {
  return physicalAlignStart(e);
}

export function chevronBackName(rtl: boolean): "chevron-back" | "chevron-forward" {
  return rtl ? "chevron-forward" : "chevron-back";
}

export function chevronForwardName(rtl: boolean): "chevron-back" | "chevron-forward" {
  return rtl ? "chevron-back" : "chevron-forward";
}
