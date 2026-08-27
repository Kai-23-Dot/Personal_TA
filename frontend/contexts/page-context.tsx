"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { mergeAssistantContextSources } from "@/frontend/lib/assistantScreenContext";

interface PageContextValue {
  pageContent: string;
  setPageContent: (sourceId: string, content: string) => void;
}

const PageContext = createContext<PageContextValue>({
  pageContent: "",
  setPageContent: () => undefined,
});

export function PageContextProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<Record<string, string>>({});
  const update = useCallback((sourceId: string, content: string) => {
    setSources((current) => {
      if (!content) {
        if (!(sourceId in current)) return current;
        const next = { ...current };
        delete next[sourceId];
        return next;
      }
      if (current[sourceId] === content) return current;
      return { ...current, [sourceId]: content };
    });
  }, []);
  const pageContent = useMemo(() => mergeAssistantContextSources(sources), [sources]);
  return (
    <PageContext.Provider value={{ pageContent, setPageContent: update }}>
      {children}
    </PageContext.Provider>
  );
}

/** Read the current page content (used by GlobalAssistant). */
export function usePageContent() {
  return useContext(PageContext).pageContent;
}

/**
 * Call this in any page component to push what's currently visible on screen
 * into the shared context so the AI Assistant can see it.
 * Clears automatically when the component unmounts (page navigation).
 */
export function useSetPageContent(content: string, sourceId?: string) {
  const { setPageContent } = useContext(PageContext);
  const generatedSourceId = useId();
  const resolvedSourceId = sourceId ?? generatedSourceId;
  useEffect(() => {
    setPageContent(resolvedSourceId, content);
    return () => setPageContent(resolvedSourceId, "");
  }, [content, resolvedSourceId, setPageContent]);
}
