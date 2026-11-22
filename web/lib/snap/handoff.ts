/**
 * What the Snap bar hands to the Snap page (/add): a link to import, or a photo or PDF. Held in memory for the one
 * navigation, because a file can't travel in an address. The Snap page takes it once when it opens.
 */
export type SnapHandoff = { url: string } | { file: File };

let pending: SnapHandoff | null = null;

export function handToSnap(handoff: SnapHandoff): void {
  pending = handoff;
}

/** The waiting link or file, if any. Taking it clears it, so a later visit to /add starts empty. */
export function takeSnapHandoff(): SnapHandoff | null {
  const taken = pending;
  pending = null;
  return taken;
}
