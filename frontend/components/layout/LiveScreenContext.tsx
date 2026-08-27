"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSetPageContent } from "@/frontend/contexts/page-context";
import { readVisibleScreenContext } from "@/frontend/lib/assistantScreenContext";

const CAPTURE_DEBOUNCE_MS = 120;

/** Keeps the assistant synchronized with the rendered dashboard without reading form values. */
export function LiveScreenContext() {
  const pathname = usePathname();
  const [screenContent, setScreenContent] = useState("");

  useSetPageContent(screenContent, "visible-screen");

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-assistant-screen]");
    if (!root) {
      setScreenContent(`Route: ${pathname}`);
      return;
    }

    let timer: number | null = null;
    const capture = () => {
      setScreenContent(readVisibleScreenContext(root, pathname));
    };
    const scheduleCapture = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(capture, CAPTURE_DEBOUNCE_MS);
    };

    capture();
    const observer = new MutationObserver(scheduleCapture);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    root.addEventListener("change", scheduleCapture, true);
    window.addEventListener("smartlearn:sync-complete", scheduleCapture);

    return () => {
      observer.disconnect();
      root.removeEventListener("change", scheduleCapture, true);
      window.removeEventListener("smartlearn:sync-complete", scheduleCapture);
      if (timer !== null) window.clearTimeout(timer);
      setScreenContent("");
    };
  }, [pathname]);

  return null;
}
