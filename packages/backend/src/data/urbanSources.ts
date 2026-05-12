export interface UrbanSource {
  name: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lng: number;
  population: number; // approximate, used for influence weighting only — not displayed
  type: 'megacity' | 'city' | 'industrial';
}

export const URBAN_SOURCES: UrbanSource[] = [
  // Thailand
  {
    name: 'Bangkok',
    country: 'TH',
    lat: 13.756,
    lng: 100.502,
    population: 10_500_000,
    type: 'megacity',
  },
  {
    name: 'Chiang Mai',
    country: 'TH',
    lat: 18.787,
    lng: 98.993,
    population: 1_200_000,
    type: 'city',
  },
  {
    name: 'Nonthaburi',
    country: 'TH',
    lat: 13.859,
    lng: 100.521,
    population: 1_100_000,
    type: 'city',
  },
  {
    name: 'Samut Prakan',
    country: 'TH',
    lat: 13.599,
    lng: 100.6,
    population: 1_000_000,
    type: 'industrial',
  },
  {
    name: 'Map Ta Phut / Rayong',
    country: 'TH',
    lat: 12.688,
    lng: 101.146,
    population: 700_000,
    type: 'industrial',
  },
  {
    name: 'Nakhon Ratchasima',
    country: 'TH',
    lat: 14.98,
    lng: 102.098,
    population: 600_000,
    type: 'city',
  },
  // Myanmar
  {
    name: 'Yangon',
    country: 'MM',
    lat: 16.866,
    lng: 96.195,
    population: 7_400_000,
    type: 'megacity',
  },
  {
    name: 'Mandalay',
    country: 'MM',
    lat: 21.975,
    lng: 96.084,
    population: 1_500_000,
    type: 'city',
  },
  // Cambodia
  {
    name: 'Phnom Penh',
    country: 'KH',
    lat: 11.562,
    lng: 104.916,
    population: 2_200_000,
    type: 'city',
  },
  // Laos
  {
    name: 'Vientiane',
    country: 'LA',
    lat: 17.975,
    lng: 102.633,
    population: 820_000,
    type: 'city',
  },
  // Vietnam
  {
    name: 'Hanoi',
    country: 'VN',
    lat: 21.028,
    lng: 105.834,
    population: 8_100_000,
    type: 'megacity',
  },
  {
    name: 'Haiphong',
    country: 'VN',
    lat: 20.844,
    lng: 106.688,
    population: 2_100_000,
    type: 'industrial',
  },
  {
    name: 'Ho Chi Minh City',
    country: 'VN',
    lat: 10.823,
    lng: 106.63,
    population: 9_000_000,
    type: 'megacity',
  },
  {
    name: 'Da Nang',
    country: 'VN',
    lat: 16.047,
    lng: 108.206,
    population: 1_200_000,
    type: 'city',
  },
  // China (southern, within plausible transport range)
  { name: 'Kunming', country: 'CN', lat: 25.046, lng: 102.71, population: 4_000_000, type: 'city' },
  {
    name: 'Chengdu',
    country: 'CN',
    lat: 30.572,
    lng: 104.066,
    population: 9_000_000,
    type: 'megacity',
  },
];
