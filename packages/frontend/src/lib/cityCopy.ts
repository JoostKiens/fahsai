// Which regional text a city page carries (locales: city.why.<group>.*). A city without a group has
// no such text yet, and its page leaves the section out.
export type CityCopyGroup = 'northernValley';

const GROUPS: Record<string, CityCopyGroup> = {
  'chiang-mai': 'northernValley',
  'chiang-rai': 'northernValley',
  lampang: 'northernValley',
  lamphun: 'northernValley',
};

export function cityCopyGroup(slug: string): CityCopyGroup | null {
  return GROUPS[slug] ?? null;
}
