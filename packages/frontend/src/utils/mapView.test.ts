import { describe, it, expect } from 'vitest';
import { initialMapView, MIN_ZOOM } from './mapView';

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

  it.each(['25', '-1', 'far'])('ignores the zoom %s', (zoom) => {
    expect(initialMapView(`?zoom=${zoom}`, DESKTOP).zoom).toBe(5.5);
  });
});
