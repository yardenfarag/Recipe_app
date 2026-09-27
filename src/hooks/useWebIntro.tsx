import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type WebIntroContextValue = {
  ready: boolean;
  dismissed: boolean;
  dismiss: () => Promise<void>;
};

const WebIntroContext = createContext<WebIntroContextValue | null>(null);

export function WebIntroProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const dismiss = useCallback(async () => {
    setDismissed(true);
  }, []);

  const value = useMemo(() => ({ ready, dismissed, dismiss }), [ready, dismissed, dismiss]);

  return <WebIntroContext.Provider value={value}>{children}</WebIntroContext.Provider>;
}

export function useWebIntro() {
  const ctx = useContext(WebIntroContext);
  if (!ctx) {
    throw new Error('useWebIntro must be used within WebIntroProvider');
  }
  return ctx;
}
