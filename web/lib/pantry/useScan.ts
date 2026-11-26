"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { clearScan, deleteScanPhotos, fetchScanPhotos, scanPantryPhoto } from "@shared/lib/supabase/pantry";
import type { PantryPlace, ScanPhoto } from "@shared/types/pantry";

import { compressImageFile } from "@/lib/compressImage";

/** The scan in progress, so leaving and coming back picks it up (its results wait on the server for a week). */
const SCAN_KEY = "pinch:pantry-scan-id";
/** Photos read at the same time. Each is its own model call; more at once only queues at the provider. */
const PARALLEL = 3;

export type PhotoStatus = "reading" | "done" | "failed" | "unreadable" | "limited";

export type ScanEntry = {
  /** Stable on this page: the server id once read, else a local one. */
  key: string;
  place: PantryPlace;
  status: PhotoStatus;
  /** A thumbnail of a photo taken on this computer. Photos from a phone or an earlier visit have none. */
  preview: string | null;
  photo: ScanPhoto | null;
  fromPhone: boolean;
  /** Kept to retry a failed read. */
  file?: File;
};

function newScanId(): string {
  return crypto.randomUUID();
}

function storedScanId(): string | null {
  try {
    return window.localStorage.getItem(SCAN_KEY);
  } catch {
    return null;
  }
}

function storeScanId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(SCAN_KEY, id);
    else window.localStorage.removeItem(SCAN_KEY);
  } catch {
    // Private mode: the scan just won't resume.
  }
}

/** Starts queued reads until PARALLEL are running; each one that ends starts the next. */
function drain(queue: RefObject<Array<() => Promise<void>>>, running: RefObject<number>) {
  while (running.current < PARALLEL && queue.current.length > 0) {
    const job = queue.current.shift()!;
    running.current += 1;
    void job().finally(() => {
      running.current -= 1;
      drain(queue, running);
    });
  }
}

const fromServer = (photo: ScanPhoto): ScanEntry => ({
  key: photo.id ?? `${photo.created_at}`,
  place: photo.place,
  status: "done",
  preview: null,
  photo,
  fromPhone: photo.from_phone,
});

/**
 * One pantry scan on the web (PIN-181). Each photo is shrunk, sent and read as soon as it's added, a few at a time,
 * so the list fills while the next photo is taken. `resumable` holds the photos of an unfinished scan from an
 * earlier visit until the person picks Keep going or Start over.
 */
export function useScan(language: string) {
  const [scanId, setScanId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ScanEntry[]>([]);
  const [resumable, setResumable] = useState<ScanPhoto[] | null>(null);
  const queue = useRef<Array<() => Promise<void>>>([]);
  const running = useRef(0);
  const scanIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const stored = storedScanId();
    const id = stored ?? newScanId();
    scanIdRef.current = id;
    // The scan id lives in this browser's storage, so it's read after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScanId(id);
    if (!stored) {
      storeScanId(id);
      return;
    }
    fetchScanPhotos(id)
      .then((photos) => {
        if (!cancelled && photos.length > 0) setResumable(photos);
      })
      .catch(() => {
        // Nothing to resume.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((key: string, patch: Partial<ScanEntry>) => {
    setEntries((list) => list.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));
  }, []);

  const pump = useCallback(() => drain(queue, running), []);

  const read = useCallback(
    (key: string, file: File, place: PantryPlace) => {
      queue.current.push(async () => {
        const id = scanIdRef.current;
        if (!id) return;
        const image = await compressImageFile(file, "pantry");
        if (!image) {
          update(key, { status: "unreadable" });
          return;
        }
        const result = await scanPantryPhoto({ scanId: id, place, language, imageBase64: image.base64 });
        if (result.status === "ok") {
          update(key, { status: "done", photo: result.photo, file: undefined });
        } else {
          update(key, { status: result.code === "daily_limit" ? "limited" : result.code === "invalid_photo" ? "unreadable" : "failed" });
        }
      });
      pump();
    },
    [language, pump, update],
  );

  const addFiles = useCallback(
    (files: File[], place: PantryPlace) => {
      const images = files.filter((file) => file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name));
      const added = images.map<ScanEntry>((file) => ({
        key: `local-${crypto.randomUUID()}`,
        place,
        status: "reading",
        preview: URL.createObjectURL(file),
        photo: null,
        fromPhone: false,
        file,
      }));
      setEntries((list) => [...list, ...added]);
      for (const entry of added) read(entry.key, entry.file!, place);
      return added.length;
    },
    [read],
  );

  const retry = useCallback(
    (key: string) => {
      const entry = entries.find((e) => e.key === key);
      if (!entry?.file) return;
      update(key, { status: "reading" });
      read(key, entry.file, entry.place);
    },
    [entries, read, update],
  );

  const remove = useCallback((key: string) => {
    setEntries((list) => {
      const entry = list.find((e) => e.key === key);
      if (entry?.preview) URL.revokeObjectURL(entry.preview);
      if (entry?.photo?.id) void deleteScanPhotos([entry.photo.id]).catch(() => undefined);
      return list.filter((e) => e.key !== key);
    });
  }, []);

  /** Picks up photos that arrived from a phone (or anywhere else) since the last look. */
  const sync = useCallback(async () => {
    const id = scanIdRef.current;
    if (!id) return;
    try {
      const photos = await fetchScanPhotos(id);
      setEntries((list) => {
        const known = new Set(list.map((entry) => entry.photo?.id).filter(Boolean));
        const fresh = photos.filter((photo) => photo.id && !known.has(photo.id)).map(fromServer);
        return fresh.length > 0 ? [...list, ...fresh] : list;
      });
    } catch {
      // Tried again on the next tick.
    }
  }, []);

  const resume = useCallback(() => {
    if (resumable) setEntries((list) => [...resumable.map(fromServer), ...list]);
    setResumable(null);
  }, [resumable]);

  const startOver = useCallback(() => {
    const old = scanIdRef.current;
    if (old) void clearScan(old).catch(() => undefined);
    const id = newScanId();
    scanIdRef.current = id;
    storeScanId(id);
    setScanId(id);
    setResumable(null);
    setEntries([]);
  }, []);

  /** After saving: the next scan starts fresh. */
  const finish = useCallback(() => {
    storeScanId(null);
  }, []);

  return { scanId, entries, resumable, addFiles, retry, remove, sync, resume, startOver, finish };
}
