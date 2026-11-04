import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ZOOM,
  DESKTOP_MEDIA_QUERY,
  MIN_ZOOM,
  MOBILE_ZOOM,
  PHONE_MEDIA_QUERY,
  initialMapView,
} from './mapView';

const DESKTOP = 1280;
const PHONE = 412;

describe('initialMapView', () => {
  it('uses the centre and zoom of the link', () => {
    expect(initialMapView('?lat=13.7&lng=100.5&zoom=7', DESKTOP)).toEqual({
      center: [100.5, 13.7],
      zoom: 7,
    });
  });

  it('starts at the desktop default when the link has no view', () => {
    expect(initialMapView('', DESKTOP)).toEqual({ center: [101, 15.5], zoom: 5.5 });
  });

  it('starts further out on a phone when the link has no view', () => {
    expect(initialMapView('', PHONE)).toEqual({ center: [102, 13.5], zoom: 4.7 });
  });

  it('keeps the link on a phone', () => {
    expect(initialMapView('?lat=13.7&lng=100.5&zoom=7', PHONE)).toEqual({
      center: [100.5, 13.7],
      zoom: 7,
    });
  });

  it.each([
    ['only lat', '?lat=13.7'],
    ['only lng', '?lng=100.5'],
    ['lat out of range', '?lat=91&lng=100.5'],
    ['lng out of range', '?lat=13.7&lng=181'],
    ['lat not a number', '?lat=north&lng=100.5'],
    ['empty values', '?lat=&lng='],
  ])('uses the default centre for %s', (_, search) => {
    expect(initialMapView(search, DESKTOP).center).toEqual([101, 15.5]);
  });

  it('keeps a valid centre when only the zoom is missing', () => {
    expect(initialMapView('?lat=13.7&lng=100.5', DESKTOP)).toEqual({
      center: [100.5, 13.7],
      zoom: 5.5,
    });
  });

  it('stops the zoom at the minimum the map allows', () => {
    expect(initialMapView('?zoom=2', DESKTOP).zoom).toBe(MIN_ZOOM);
  });

  it.each(['23', '25', '-1', 'far'])('ignores the zoom %s', (zoom) => {
    expect(initialMapView(`?zoom=${zoom}`, DESKTOP).zoom).toBe(5.5);
  });

  it('keeps the deepest zoom Mapbox can show', () => {
    expect(initialMapView('?zoom=22', DESKTOP).zoom).toBe(22);
  });

  it.each([
    ['trailing text', '?lat=13.7abc&lng=100.5'],
    ['a trailing space', '?lat=13.7%20&lng=100.5'],
    ['a trailing comma', '?lat=13.7&lng=100.5,'],
    ['exponent notation', '?lat=1e1&lng=100.5'],
  ])('uses the default centre for a mangled link with %s', (_, search) => {
    expect(initialMapView(search, DESKTOP).center).toEqual([101, 15.5]);
  });

  it.each(['5.5.1', '7x', '1e1', ' 7'])('ignores the mangled zoom %j', (zoom) => {
    expect(initialMapView(`?zoom=${encodeURIComponent(zoom)}`, DESKTOP).zoom).toBe(5.5);
  });

  it('hands out its own copy of the centre, so changing it does not change the defaults', () => {
    initialMapView('', DESKTOP).center[0] = 0;
    initialMapView('', PHONE).center[0] = 0;

    expect(initialMapView('', DESKTOP).center).toEqual([101, 15.5]);
    expect(initialMapView('', PHONE).center).toEqual([102, 13.5]);
  });
});

describe('the phone and desktop media queries', () => {
  it('split the screens where initialMapView does, so each starts with its own placeholder', () => {
    expect(PHONE_MEDIA_QUERY).toBe('(max-width: 767px)');
    expect(DESKTOP_MEDIA_QUERY).toBe('(min-width: 768px)');
    expect(initialMapView('', 767).zoom).toBe(MOBILE_ZOOM);
    expect(initialMapView('', 768).zoom).toBe(DEFAULT_ZOOM);
  });
});
