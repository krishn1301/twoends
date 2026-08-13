import { describe, expect, it } from 'vitest';

import {
  COARSE_GRID_DEG,
  COARSE_NOISE_KM,
  STALE_AFTER_MS,
  coarsen,
  describeAge,
  formatKm,
  haversineKm,
  readDistance,
  type Fix,
} from './distance.ts';

const NOW = Date.parse('2026-08-13T12:00:00Z');
const fresh = (lat: number, lng: number): Fix => ({
  lat,
  lng,
  updatedAt: new Date(NOW - 60_000).toISOString(),
});

/*
  Real places, so a wrong formula is obvious rather than self-consistent. A unit
  test built from made-up coordinates would pass against a haversine with the
  latitudes swapped; these would not.
*/
const DELHI = { lat: 28.6139, lng: 77.209 };
const MUMBAI = { lat: 19.076, lng: 72.8777 };
const LONDON = { lat: 51.5074, lng: -0.1278 };
const PARIS = { lat: 48.8566, lng: 2.3522 };

describe('haversineKm', () => {
  it('matches known great-circle distances', () => {
    // Published figures: Delhi–Mumbai ~1148 km, London–Paris ~344 km.
    expect(haversineKm(DELHI, MUMBAI)).toBeCloseTo(1148, -1);
    expect(haversineKm(LONDON, PARIS)).toBeCloseTo(344, -1);
  });

  it('is zero for a point against itself, and symmetric', () => {
    expect(haversineKm(DELHI, DELHI)).toBe(0);
    expect(haversineKm(DELHI, LONDON)).toBeCloseTo(haversineKm(LONDON, DELHI), 9);
  });

  it('survives antipodes without going NaN', () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isFinite(km)).toBe(true);
    expect(km).toBeCloseTo(Math.PI * 6371.0088, 0);
  });

  it('crosses the antimeridian by the short way', () => {
    // 1° apart, either side of the date line. A naive difference of longitudes
    // would call this 359° and report most of the planet.
    const km = haversineKm({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 });
    expect(km).toBeLessThan(120);
  });
});

describe('coarsen', () => {
  it('snaps to the grid', () => {
    const c = coarsen(DELHI);
    expect(c.lat).toBeCloseTo(28.6, 6);
    expect(c.lng).toBeCloseTo(77.2, 6);
  });

  it('never moves a point further than half a cell on either axis', () => {
    for (let i = 0; i < 500; i++) {
      const point = { lat: Math.random() * 170 - 85, lng: Math.random() * 360 - 180 };
      const c = coarsen(point);
      expect(Math.abs(c.lat - point.lat)).toBeLessThanOrEqual(COARSE_GRID_DEG / 2 + 1e-9);
      expect(Math.abs(c.lng - point.lng)).toBeLessThanOrEqual(COARSE_GRID_DEG / 2 + 1e-9);
    }
  });

  it('keeps the noise floor above the worst error the grid can introduce', () => {
    // Half a cell on each axis, for each person, at the equator where a degree
    // of longitude is longest. This is the number COARSE_NOISE_KM has to clear
    // for "same city" to be an honest thing to print.
    const half = COARSE_GRID_DEG / 2;
    const worst =
      2 * haversineKm({ lat: 0, lng: 0 }, { lat: half, lng: half });
    expect(COARSE_NOISE_KM).toBeGreaterThanOrEqual(worst);
  });
});

describe('formatKm', () => {
  it('rounds a coarse reading to ten, and to fifty past two hundred', () => {
    expect(formatKm(37.4, 'coarse')).toBe('40');
    expect(formatKm(1148, 'coarse')).toBe('1150');
  });

  it('gives a precise reading one decimal, but only under ten', () => {
    expect(formatKm(3.44, 'precise')).toBe('3.4');
    expect(formatKm(41.6, 'precise')).toBe('42');
  });
});

describe('readDistance', () => {
  const base = { precision: 'coarse' as const, theirName: 'Kishu', nowMs: NOW };

  it('is off when neither has shared', () => {
    const r = readDistance({ ...base, mine: null, theirs: null });
    expect(r.kind).toBe('off');
    expect(r.km).toBeNull();
    expect(r.note).toMatch(/turn on location/i);
  });

  it('names the other person when only they have not shared', () => {
    const r = readDistance({ ...base, mine: fresh(28.6, 77.2), theirs: null });
    expect(r.kind).toBe('off');
    expect(r.note).toContain('Kishu');
  });

  it('goes stale rather than asserting an old position', () => {
    const old = {
      lat: 19.1,
      lng: 72.9,
      updatedAt: new Date(NOW - STALE_AFTER_MS - 1000).toISOString(),
    };
    const r = readDistance({ ...base, mine: fresh(28.6, 77.2), theirs: old });
    expect(r.kind).toBe('stale');
    expect(r.km).toBeNull();
  });

  it('treats an unparseable timestamp as ancient, not as now', () => {
    const r = readDistance({
      ...base,
      mine: fresh(28.6, 77.2),
      theirs: { lat: 19.1, lng: 72.9, updatedAt: 'not a date' },
    });
    expect(r.kind).toBe('stale');
  });

  it('says "same city" instead of a number the grid cannot support', () => {
    const r = readDistance({ ...base, mine: fresh(28.6, 77.2), theirs: fresh(28.6, 77.3) });
    expect(r.kind).toBe('near');
    expect(r.label).toBe('same city');
  });

  it('refuses "same city" at the same separation when the fix is precise', () => {
    // ~9.8 km apart: inside the coarse noise floor, well outside a room.
    const r = readDistance({
      ...base,
      precision: 'precise',
      mine: fresh(28.6, 77.2),
      theirs: fresh(28.6, 77.3),
    });
    expect(r.kind).toBe('apart');
    expect(r.label).toBe('9.8');
  });

  it('says "here" only when precise and genuinely on top of each other', () => {
    const r = readDistance({
      ...base,
      precision: 'precise',
      mine: fresh(28.6139, 77.209),
      theirs: fresh(28.6139, 77.2091),
    });
    expect(r.kind).toBe('near');
    expect(r.label).toBe('here');
  });

  it('reports a real separation with the partner named in the note', () => {
    const r = readDistance({
      ...base,
      mine: fresh(DELHI.lat, DELHI.lng),
      theirs: fresh(MUMBAI.lat, MUMBAI.lng),
    });
    expect(r.kind).toBe('apart');
    expect(r.label).toBe('1150');
    expect(r.note).toBe('km from Kishu');
  });

  it('falls back to "them" when the partner has no name yet', () => {
    const r = readDistance({
      ...base,
      theirName: '   ',
      mine: fresh(DELHI.lat, DELHI.lng),
      theirs: fresh(MUMBAI.lat, MUMBAI.lng),
    });
    expect(r.note).toBe('km from them');
  });

  it('never returns a coordinate in any state', () => {
    const readings = [
      readDistance({ ...base, mine: null, theirs: null }),
      readDistance({ ...base, mine: fresh(28.6, 77.2), theirs: fresh(19.1, 72.9) }),
    ];
    for (const r of readings) {
      expect(Object.keys(r).sort()).toEqual(['km', 'kind', 'label', 'note', 'since'].sort());
    }
  });

  it('ages the reading by the older of the two fixes, not the newer', () => {
    const r = readDistance({
      ...base,
      mine: fresh(28.6, 77.2),
      theirs: {
        lat: 19.1,
        lng: 72.9,
        updatedAt: new Date(NOW - 5 * 3_600_000).toISOString(),
      },
    });
    expect(r.since).toBe('5 hours ago');
  });
});

describe('describeAge', () => {
  it('rounds down, so nothing is claimed fresher than it is', () => {
    expect(describeAge(119_000)).toBe('just now');
    expect(describeAge(59 * 60_000)).toBe('59 minutes ago');
    // 119 minutes is not "2 hours"; it is one hour and a lot of change.
    expect(describeAge(119 * 60_000)).toBe('an hour ago');
    expect(describeAge(47 * 3_600_000)).toBe('yesterday');
    expect(describeAge(50 * 3_600_000)).toBe('2 days ago');
  });

  it('survives the infinite age an unparseable timestamp produces', () => {
    expect(describeAge(Number.POSITIVE_INFINITY)).toBe('a long time ago');
  });
});
