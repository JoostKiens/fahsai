export type SourceType = 'megacity' | 'city' | 'industrial' | 'power_plant';

export interface UrbanSource {
  name: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lng: number;
  type: SourceType;
  /** For cities/megacities: approximate population. For industrial/power_plant: 0. */
  population: number;
  /**
   * For power_plant: installed capacity in MW. For industrial: relative emission
   * weight (1–10 scale). For cities: 0.
   * Used in influence scoring alongside population.
   */
  emissionProxy: number;
}

export const URBAN_SOURCES: UrbanSource[] = [
  // Thailand — cities
  {
    name: 'Bangkok',
    country: 'TH',
    lat: 13.756,
    lng: 100.502,
    population: 10_500_000,
    type: 'megacity',
    emissionProxy: 0,
  },
  {
    name: 'Chiang Mai',
    country: 'TH',
    lat: 18.787,
    lng: 98.993,
    population: 1_200_000,
    type: 'city',
    emissionProxy: 0,
  },
  {
    name: 'Nonthaburi',
    country: 'TH',
    lat: 13.859,
    lng: 100.521,
    population: 1_100_000,
    type: 'city',
    emissionProxy: 0,
  },
  {
    name: 'Nakhon Ratchasima',
    country: 'TH',
    lat: 14.98,
    lng: 102.098,
    population: 600_000,
    type: 'city',
    emissionProxy: 0,
  },
  // Thailand — industrial zones
  {
    name: 'Samut Prakan',
    country: 'TH',
    lat: 13.599,
    lng: 100.6,
    population: 1_000_000,
    type: 'industrial',
    emissionProxy: 4,
  },
  {
    name: 'Map Ta Phut / Rayong',
    country: 'TH',
    lat: 12.688,
    lng: 101.146,
    population: 700_000,
    type: 'industrial',
    emissionProxy: 8,
  },
  // Thailand — coal power plants (from power_plants DB table)
  {
    name: 'Mae Mah',
    country: 'TH',
    lat: 18.2963,
    lng: 99.7499,
    population: 0,
    type: 'power_plant',
    emissionProxy: 2400,
  },
  {
    name: 'BLCP Power',
    country: 'TH',
    lat: 12.6448,
    lng: 101.1605,
    population: 0,
    type: 'power_plant',
    emissionProxy: 1346,
  },
  {
    name: 'Gheco One power station',
    country: 'TH',
    lat: 12.6779,
    lng: 101.1356,
    population: 0,
    type: 'power_plant',
    emissionProxy: 660,
  },
  {
    name: 'Glow Energy power complex',
    country: 'TH',
    lat: 12.6779,
    lng: 101.1356,
    population: 0,
    type: 'power_plant',
    emissionProxy: 526,
  },
  {
    name: 'Tha Tum power station',
    country: 'TH',
    lat: 13.9325,
    lng: 101.5876,
    population: 0,
    type: 'power_plant',
    emissionProxy: 328,
  },
  // Myanmar
  {
    name: 'Yangon',
    country: 'MM',
    lat: 16.866,
    lng: 96.195,
    population: 7_400_000,
    type: 'megacity',
    emissionProxy: 0,
  },
  {
    name: 'Mandalay',
    country: 'MM',
    lat: 21.975,
    lng: 96.084,
    population: 1_500_000,
    type: 'city',
    emissionProxy: 0,
  },
  {
    name: 'Tigyit',
    country: 'MM',
    lat: 20.43,
    lng: 96.702,
    population: 0,
    type: 'power_plant',
    emissionProxy: 120,
  },
  // Laos
  {
    name: 'Vientiane',
    country: 'LA',
    lat: 17.975,
    lng: 102.633,
    population: 820_000,
    type: 'city',
    emissionProxy: 0,
  },
  {
    name: 'Hongsa',
    country: 'LA',
    lat: 19.691,
    lng: 101.28,
    population: 0,
    type: 'power_plant',
    emissionProxy: 1878,
  },
  // Cambodia
  {
    name: 'Phnom Penh',
    country: 'KH',
    lat: 11.562,
    lng: 104.916,
    population: 2_200_000,
    type: 'city',
    emissionProxy: 0,
  },
  // Vietnam
  {
    name: 'Hanoi',
    country: 'VN',
    lat: 21.028,
    lng: 105.834,
    population: 8_100_000,
    type: 'megacity',
    emissionProxy: 0,
  },
  {
    name: 'Haiphong',
    country: 'VN',
    lat: 20.844,
    lng: 106.688,
    population: 2_100_000,
    type: 'industrial',
    emissionProxy: 0,
  },
  {
    name: 'Ho Chi Minh City',
    country: 'VN',
    lat: 10.823,
    lng: 106.63,
    population: 9_000_000,
    type: 'megacity',
    emissionProxy: 0,
  },
  {
    name: 'Da Nang',
    country: 'VN',
    lat: 16.047,
    lng: 108.206,
    population: 1_200_000,
    type: 'city',
    emissionProxy: 0,
  },
  // China (southern, within plausible transport range)
  {
    name: 'Kunming',
    country: 'CN',
    lat: 25.046,
    lng: 102.71,
    population: 4_000_000,
    type: 'city',
    emissionProxy: 0,
  },
  {
    name: 'Chengdu',
    country: 'CN',
    lat: 30.572,
    lng: 104.066,
    population: 9_000_000,
    type: 'megacity',
    emissionProxy: 0,
  },
];
