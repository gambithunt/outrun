const CAR_DATA = {
  BMW: ['M2', 'M3 Competition', '330i', 'X3 M40i'],
  Toyota: ['GR Yaris', 'GR Supra', 'Corolla', 'Hilux'],
  Ford: ['Mustang GT', 'Focus ST', 'Ranger Raptor', 'Fiesta ST'],
  Volkswagen: ['Golf GTI', 'Golf R', 'Polo GTI', 'Tiguan R'],
  Audi: ['S3', 'RS3', 'S4', 'SQ5'],
  'Mercedes-Benz': ['A35 AMG', 'C63 AMG', 'GLA 35', 'E53 AMG'],
  Porsche: ['718 Cayman', '911 Carrera', 'Macan GTS', 'Cayenne'],
  Subaru: ['WRX', 'BRZ', 'Forester XT', 'Outback'],
  Honda: ['Civic Type R', 'Civic RS', 'Accord', 'CR-V'],
  Nissan: ['370Z', '400Z', 'GT-R', 'Navara'],
  Hyundai: ['i20 N', 'i30 N', 'Tucson N Line', 'Santa Fe'],
  Kia: ['Stinger GT', 'Cerato GT', 'Sportage', 'Seltos'],
} as const;

export const POPULAR_CAR_MAKES = Object.keys(CAR_DATA);

export function getSuggestedMakes(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return POPULAR_CAR_MAKES.slice(0, 6);
  }

  return POPULAR_CAR_MAKES.filter((make) => make.toLowerCase().includes(normalized)).slice(0, 6);
}

export function getSuggestedModels(make: string, query: string) {
  const matches = CAR_DATA[make as keyof typeof CAR_DATA] ?? [];
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return matches.slice(0, 6);
  }

  return matches.filter((model) => model.toLowerCase().includes(normalized)).slice(0, 6);
}
