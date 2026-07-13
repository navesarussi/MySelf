"use client";

import { useEffect } from "react";

/**
 * iOS Safari ignores `user-scalable=no` / `maximum-scale` in the viewport meta,
 * so pinch- and double-tap-zoom stay enabled there. This blocks those gestures
 * at the event level (plus Ctrl+wheel on desktop) to keep the app locked to the
 * device width — if a zoom does start, the browser snaps back immediately.
 */
export function NoZoom() {
  useEffect(() => {
    document.documentElement.dataset.zoomLock = "on";
    const prevent = (e: Event) => e.preventDefault();

    // iOS Safari pinch gestures
    document.addEventListener("gesturestart", prevent, { passive: false });
    document.addEventListener("gesturechange", prevent, { passive: false });
    document.addEventListener("gestureend", prevent, { passive: false });

    // Pinch via multi-touch on any browser
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    // Double-tap to zoom
    let lastTouchEnd = 0;
    const onTouchEnd = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    };
    document.addEventListener("touchend", onTouchEnd, { passive: false });

    // Ctrl/⌘ + wheel zoom on desktop
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    document.addEventListener("wheel", onWheel, { passive: false });

    // Reset any residual zoom on orientation change
    const resetScale = () => {
      (document.documentElement.style as CSSStyleDeclaration & { zoom?: string }).zoom = "1";
    };
    window.addEventListener("orientationchange", resetScale);

    return () => {
      document.removeEventListener("gesturestart", prevent);
      document.removeEventListener("gesturechange", prevent);
      document.removeEventListener("gestureend", prevent);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("wheel", onWheel);
      window.removeEventListener("orientationchange", resetScale);
    };
  }, []);

  return null;
}
