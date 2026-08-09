// Real-filesystem read (Mandate 6): the coordinate reader is exercised
// against the actual committed data/spots files, never a mocked YAML string,
// so a drift in the human-owned source file fails this test for the right
// reason.

import { describe, expect, it } from 'vitest';

import { loadLaunchSpotCoordinates } from '../../src/pipeline/adapters/spot-coordinates';

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
