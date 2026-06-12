import type { PendingSelection, SelectedPoint } from '@/store/uiStore';

/**
 * Serialize a resolved `SelectedPoint` to the `sel=` URL value (without the key).
 * Returns null for an empty selection or a malformed point with no discriminator.
 */
export function selParamFromSelection(sel: SelectedPoint | null): string | null {
  if (!sel) return null;
  if (sel.station) return `station:${encodeURIComponent(sel.station.stationId)}`;
  if (sel.fire) return `fire:${sel.fire.id}`;
  if (sel.powerPlant) return `plant:${sel.powerPlant.id}`;
  return null;
}

/**
 * Serialize an in-flight `PendingSelection` to the same `sel=` value.
 * Used as a fallback by the URL writer while hydration is in progress so
 * a mid-hydration copy still produces a shareable link.
 */
export function selParamFromPending(p: PendingSelection | null): string | null {
  if (!p) return null;
  return `${p.kind}:${encodeURIComponent(p.id)}`;
}

/**
 * Parse the value of a `sel=` query parameter into a `PendingSelection`.
 * Returns null when the input is missing, empty, malformed, or specifies an
 * unknown kind. Accepts ids that contain colons (only the first `:` is the
 * kind/id separator).
 */
export function parsePendingSelection(raw: string | null | undefined): PendingSelection | null {
  if (!raw) return null;
  const colon = raw.indexOf(':');
  if (colon <= 0) return null;
  const kindRaw = raw.slice(0, colon);
  const idRaw = raw.slice(colon + 1);
  if (!idRaw) return null;
  if (kindRaw !== 'station' && kindRaw !== 'fire' && kindRaw !== 'plant') return null;
  let id: string;
  try {
    id = decodeURIComponent(idRaw);
  } catch {
    return null;
  }
  if (!id) return null;
  return { kind: kindRaw, id };
}

/** Convenience: read and parse `sel` from a `window.location.search` string. */
export function parsePendingSelectionFromSearch(search: string): PendingSelection | null {
  return parsePendingSelection(new URLSearchParams(search).get('sel'));
}
