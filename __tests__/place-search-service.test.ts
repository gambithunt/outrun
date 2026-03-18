import {
  buildPlaceSearchUrl,
  buildReverseGeocodeUrl,
  searchPlacesWithProvider,
} from '@/lib/placeSearchService';

describe('placeSearchService', () => {
  it('builds a place search url with the query and limit', () => {
    const url = buildPlaceSearchUrl('Johannesburg');
    expect(url).toContain('nominatim.openstreetmap.org');
    expect(url).toContain('Johannesburg');
    expect(url).toContain('limit=5');
  });

  it('builds a reverse geocode url', () => {
    const url = buildReverseGeocodeUrl(-26.2041, 28.0473);
    expect(url).toContain('lat=-26.2041');
    expect(url).toContain('lon=28.0473');
  });

  it('normalizes nominatim search results', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          place_id: 123,
          display_name: 'Johannesburg, Gauteng, South Africa',
          lat: '-26.2041',
          lon: '28.0473',
        },
      ],
    });

    const results = await searchPlacesWithProvider('Johannesburg', {}, fetchImpl);

    expect(results).toEqual([
      {
        id: '123',
        label: 'Johannesburg, Gauteng, South Africa',
        lat: -26.2041,
        lng: 28.0473,
      },
    ]);
  });
});
