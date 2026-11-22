"use client";

import { useCallback, useEffect, useState } from "react";

import { errorText } from "@shared/lib/errorText";

type Result<T> = { request: string; data: T | null; error: string | null };

export type AdminData<T> = {
  /** The last answer that arrived, kept on screen while the next one loads (a new range, Refresh). */
  data: T | null;
  /** Why the latest request failed, in the server's words when it gave any. */
  error: string | null;
  loading: boolean;
  reload: () => void;
  /** Changes the data on screen after an action (a credit grant, a closed ticket) without reading it again. */
  setData: (update: (current: T | null) => T | null) => void;
};

/**
 * Reads one admin data set. `key` names what is being read (the range, the search), and `load` must change exactly
 * when it does (wrap it in useCallback). Every admin read is checked by the database (admin-only RPCs and row
 * rules), so a non-admin gets an error or nothing here, never someone else's data.
 */
export function useAdminData<T>(key: string, load: () => Promise<T>, fallbackError: string): AdminData<T> {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const [latest, setLatest] = useState<T | null>(null);
  const request = `${key}#${nonce}`;

  useEffect(() => {
    // Reads from the network, so state is only set when the answer arrives.
    let cancelled = false;
    load().then(
      (data) => {
        if (cancelled) return;
        setResult({ request, data, error: null });
        setLatest(data);
      },
      (err: unknown) => {
        if (!cancelled) setResult({ request, data: null, error: errorText(err, fallbackError) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [request, load, fallbackError]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((update: (current: T | null) => T | null) => setLatest(update), []);
  const loading = result?.request !== request;

  return { data: latest, error: loading ? null : (result?.error ?? null), loading, reload, setData };
}
