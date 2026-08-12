// Real-filesystem read (Mandate 6): the coordinate reader is exercised
// against the actual committed data/spots files, never a mocked YAML string,
// so a drift in the human-owned source file fails this test for the right
// reason.

import { describe, expect, it } from 'vitest';

import {
  loadLaunchSpotCoordinates,
  loadLaunchSpotOrientations,
} from '../../src/pipeline/adapters/spot-coordinates';

describe('loadLaunchSpotCoordinates (real data/spots read)', () => {
  it('resolves a real lat/lon for every one of the 20 launch spots', () => {
    const coordinates = loadLaunchSpotCoordinates();

    expect(coordinates).toHaveLength(20);
    for (const coordinate of coordinates) {
      expect(coordinate.spot_id.length).toBeGreaterThan(0);
      expect(Number.isFinite(coordinate.lat)).toBe(true);
      expect(Number.isFinite(coordinate.lon)).toBe(true);
      // Every launch spot sits on Panama's Pacific coast.
      expect(coordinate.lat).toBeGreaterThan(6);
      expect(coordinate.lat).toBeLessThan(10);
      expect(coordinate.lon).toBeGreaterThan(-83);
      expect(coordinate.lon).toBeLessThan(-79);
    }

    const venao = coordinates.find((c) => c.spot_id === 'playa-venao');
    expect(venao).toEqual({ spot_id: 'playa-venao', lat: 7.4320526, lon: -80.1928532 });
  });
});

describe('loadLaunchSpotOrientations (real data/spots read)', () => {
  it('resolves the declared facing of every launch spot, or an honest null', () => {
    const orientations = loadLaunchSpotOrientations();

    expect(orientations).toHaveLength(20);
    for (const orientation of orientations) {
      expect(Number.isFinite(orientation.lat)).toBe(true);
      expect(Number.isFinite(orientation.lon)).toBe(true);
      if (orientation.shore_normal_deg === null) continue;
      expect(orientation.shore_normal_deg).toBeGreaterThanOrEqual(0);
      expect(orientation.shore_normal_deg).toBeLessThan(360);
    }

    // The seed derives this value on every row and says so; the reader carries
    // the number, never a claim about how it was obtained.
    const venao = orientations.find((o) => o.spot_id === 'playa-venao');
    expect(venao?.shore_normal_deg).toBe(158);
  });

  it("reads the facing from each spot's own row, not from the row above it", () => {
    const orientations = loadLaunchSpotOrientations();
    const byId = new Map(orientations.map((o) => [o.spot_id, o.shore_normal_deg]));

    // Three rows the seed gives three different facings. A reader that slid by
    // one row, or that fell back to a regional default, would flatten these.
    expect(byId.get('playa-malibu')).toBe(135);
    expect(byId.get('punta-chame')).toBe(180);
    expect(byId.get('playa-torio')).toBe(252);
  });
});
