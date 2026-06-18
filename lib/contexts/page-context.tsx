"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface PageContextValue {
  pageContent: string;
  setPageContent: (content: string) => void;
}

const PageContext = createContext<PageContextValue>({
  pageContent: "",
  setPageContent: () => {},
});

export function PageContextProvider({ children }: { children: ReactNode }) {
  const [pageContent, setPageContent] = useState("");
  const update = useCallback((content: string) => setPageContent(content), []);
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
export function useSetPageContent(content: string) {
  const { setPageContent } = useContext(PageContext);
  useEffect(() => {
    setPageContent(content);
    return () => setPageContent("");
  }, [content, setPageContent]);
}
