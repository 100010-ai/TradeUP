"use client";

import { useEffect } from "react";

export default function TelegramSafeAreaGuard() {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    const sync = () => {
      const safe = webApp.safeAreaInset;
      const content = webApp.contentSafeAreaInset;
      const max = (side: "top" | "right" | "bottom" | "left") => Math.max(0, Number(safe?.[side] ?? 0), Number(content?.[side] ?? 0));
      const measuredTop = max("top");
      const guardedTop = webApp.isFullscreen && measuredTop < 20 ? 46 : measuredTop;
      const root = document.documentElement;
      root.style.setProperty("--tradeup-guard-top", `${guardedTop}px`);
      root.style.setProperty("--tradeup-guard-right", `${max("right")}px`);
      root.style.setProperty("--tradeup-guard-bottom", `${max("bottom")}px`);
      root.style.setProperty("--tradeup-guard-left", `${max("left")}px`);
      root.dataset.tradeupFullscreen = webApp.isFullscreen ? "true" : "false";
    };
    const events = ["safeAreaChanged", "contentSafeAreaChanged", "fullscreenChanged", "viewportChanged"];
    events.forEach((event) => webApp.onEvent?.(event, sync));
    sync();
    const t1 = window.setTimeout(sync, 100);
    const t2 = window.setTimeout(sync, 500);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); events.forEach((event) => webApp.offEvent?.(event, sync)); };
  }, []);
  return null;
}
