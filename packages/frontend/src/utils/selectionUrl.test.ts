import { describe, it, expect } from 'vitest';
import {
  parsePendingSelection,
  parsePendingSelectionFromSearch,
  selParamFromPending,
  selParamFromSelection,
} from './selectionUrl.js';
import type { PendingSelection, SelectedPoint } from '@/store/uiStore';

const station: SelectedPoint = {
  lngLat: [100.5, 13.7],
  station: {
    stationId: 'th-123',
    stationName: 'Bangkok Center',
    country: 'TH',
    pm25: 42,
    measuredAt: '2026-03-15T10:00:00Z',
  },
};

const fire: SelectedPoint = {
  lngLat: [104.0, 12.5],
  fire: {
    id: 9876,
    frp: 23.4,
    confidence: 'nominal',
    detectedAt: '2026-03-15T03:00:00Z',
    daynight: 'D',
  },
};

const plant: SelectedPoint = {
  lngLat: [101.2, 14.9],
  powerPlant: {
    id: 555,
    name: 'Mae Moh',
    fuelType: 'Coal',
    capacityMw: 2400,
    owner: 'EGAT',
    commissionedYear: 1978,
    country: 'TH',
  },
};

describe('selParamFromSelection', () => {
  it('returns null for a null selection', () => {
    expect(selParamFromSelection(null)).toBeNull();
  });

  it('returns null when no discriminator is set', () => {
    expect(selParamFromSelection({ lngLat: [0, 0] })).toBeNull();
  });

  it('serializes a station', () => {
    expect(selParamFromSelection(station)).toBe('station:th-123');
  });

  it('serializes a fire by numeric id', () => {
    expect(selParamFromSelection(fire)).toBe('fire:9876');
  });

  it('serializes a power plant by numeric id', () => {
    expect(selParamFromSelection(plant)).toBe('plant:555');
  });

  it('percent-encodes station ids that contain reserved characters', () => {
    const weird: SelectedPoint = {
      ...station,
      station: { ...station.station!, stationId: 'us/east:42' },
    };
    expect(selParamFromSelection(weird)).toBe('station:us%2Feast%3A42');
  });
});

describe('selParamFromPending', () => {
  it('returns null for a null pending selection', () => {
    expect(selParamFromPending(null)).toBeNull();
  });

  it('serializes each kind verbatim', () => {
    expect(selParamFromPending({ kind: 'station', id: 'th-123' })).toBe('station:th-123');
    expect(selParamFromPending({ kind: 'fire', id: '9876' })).toBe('fire:9876');
    expect(selParamFromPending({ kind: 'plant', id: '555' })).toBe('plant:555');
  });

  it('percent-encodes reserved characters in the id', () => {
    expect(selParamFromPending({ kind: 'station', id: 'us/east:42' })).toBe(
      'station:us%2Feast%3A42',
    );
  });
});

describe('parsePendingSelection', () => {
  it('returns null for null/undefined/empty input', () => {
    expect(parsePendingSelection(null)).toBeNull();
    expect(parsePendingSelection(undefined)).toBeNull();
    expect(parsePendingSelection('')).toBeNull();
  });

  it('returns null when the colon is missing', () => {
    expect(parsePendingSelection('station')).toBeNull();
    expect(parsePendingSelection('station-th-123')).toBeNull();
  });

  it('returns null when the kind is unknown', () => {
    expect(parsePendingSelection('node:42')).toBeNull();
    expect(parsePendingSelection('STATION:th-1')).toBeNull(); // case-sensitive on purpose
  });

  it('returns null when the id portion is empty', () => {
    expect(parsePendingSelection('station:')).toBeNull();
    expect(parsePendingSelection('fire:')).toBeNull();
  });

  it('returns null when the kind portion is empty', () => {
    expect(parsePendingSelection(':123')).toBeNull();
  });

  it('parses each valid kind', () => {
    expect(parsePendingSelection('station:th-123')).toEqual<PendingSelection>({
      kind: 'station',
      id: 'th-123',
    });
    expect(parsePendingSelection('fire:9876')).toEqual<PendingSelection>({
      kind: 'fire',
      id: '9876',
    });
    expect(parsePendingSelection('plant:555')).toEqual<PendingSelection>({
      kind: 'plant',
      id: '555',
    });
  });

  it('decodes percent-encoded ids', () => {
    expect(parsePendingSelection('station:us%2Feast%3A42')).toEqual<PendingSelection>({
      kind: 'station',
      id: 'us/east:42',
    });
  });

  it('round-trips encoded ids through serialize → parse', () => {
    const original: PendingSelection = { kind: 'station', id: 'a/b:c d' };
    const encoded = selParamFromPending(original);
    expect(parsePendingSelection(encoded)).toEqual(original);
  });

  it('returns null when the id contains an invalid percent escape', () => {
    expect(parsePendingSelection('station:%E0%A4%A')).toBeNull();
  });
});

describe('parsePendingSelectionFromSearch', () => {
  it('extracts sel from a query string', () => {
    expect(
      parsePendingSelectionFromSearch('?date=2026-03-15&sel=fire:9876'),
    ).toEqual<PendingSelection>({ kind: 'fire', id: '9876' });
  });

  it('returns null when sel is absent', () => {
    expect(parsePendingSelectionFromSearch('?date=2026-03-15')).toBeNull();
    expect(parsePendingSelectionFromSearch('')).toBeNull();
  });

  it('accepts a search string without the leading ?', () => {
    expect(parsePendingSelectionFromSearch('sel=plant:555')).toEqual<PendingSelection>({
      kind: 'plant',
      id: '555',
    });
  });
});
