import { createFiresLayer } from '../FiresLayer';
import { DeckHarness } from './DeckHarness';
import firesResponse from './fixtures/2026-10-24/fires.json';

/**
 * Story-only wrapper, not an app component.
 * NASA FIRMS fire detections for 2026-10-24 (556 points), as the map draws them.
 *
 * Correct output: small orange-to-yellow glowing dots on the dark background, most of them
 * north of 14°N: a dense north–south line around 15°N 108.5°E, a second dense band around
 * 20–24°N 109.5°E, and scattered dots across the north. Brighter where detections overlap.
 * The play function picks the fire layer in 97–106°E, 14–23°N and expects most of the
 * fixture's fires there to be found.
 */
export function Fires() {
  return <DeckHarness layers={[createFiresLayer(firesResponse.data, 1, () => {})]} />;
}
