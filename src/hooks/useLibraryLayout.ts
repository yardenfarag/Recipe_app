import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBreakpoint } from '@/hooks/useBreakpoint';

const STORAGE_KEY = 'pinch:libraryLayout';

export type LibraryLayout = 'list' | 'grid';

function isLibraryLayout(value: string | null): value is LibraryLayout {
  return value === 'list' || value === 'grid';
}

/**
 * Library list vs grid. Unset follows the breakpoint (list on phones, grid
 * on tablet/desktop); a tap persists the choice.
 */
export function useLibraryLayout() {
  const { isMediumUp, isWide } = useBreakpoint();
  const [saved, setSaved] = useState<LibraryLayout | null>(null);
  const userSet = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && !userSet.current && isLibraryLayout(raw)) {
          setSaved(raw);
        }
      } catch {
        // Keep breakpoint default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const layout: LibraryLayout = saved ?? (isMediumUp ? 'grid' : 'list');
  const numColumns = layout === 'grid' ? (isWide ? 3 : 2) : 1;

  const setLayout = useCallback((next: LibraryLayout) => {
    userSet.current = true;
    setSaved(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggleLayout = useCallback(() => {
    setLayout(layout === 'grid' ? 'list' : 'grid');
  }, [layout, setLayout]);

  return { layout, numColumns, setLayout, toggleLayout };
}
