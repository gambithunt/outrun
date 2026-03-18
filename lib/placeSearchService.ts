type EnvMap = Record<string, string | undefined>;

export type PlaceSearchResult = {
  id: string;
  label: string;
  lat: number;
  lng: number;
};

const runtimeEnv: EnvMap =
  (globalThis as { process?: { env?: EnvMap } }).process?.env ?? {};

const DEFAULT_PROVIDER_BASE_URL = 'https://nominatim.openstreetmap.org';

function getProviderBaseUrl(env: EnvMap = runtimeEnv) {
  return env.EXPO_PUBLIC_PLACES_API_BASE_URL ?? DEFAULT_PROVIDER_BASE_URL;
}

export function buildPlaceSearchUrl(query: string, env: EnvMap = runtimeEnv, limit = 5) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(limit),
  });
  return `${getProviderBaseUrl(env)}/search?${params.toString()}`;
}

export function buildReverseGeocodeUrl(lat: number, lng: number, env: EnvMap = runtimeEnv) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
  });
  return `${getProviderBaseUrl(env)}/reverse?${params.toString()}`;
}

export async function searchPlacesWithProvider(
  query: string,
  env: EnvMap = runtimeEnv,
  fetchImpl: typeof fetch = fetch
): Promise<PlaceSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const response = await fetchImpl(buildPlaceSearchUrl(trimmed, env), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Unable to load place suggestions right now.');
  }

  const payload = (await response.json()) as Array<{
    place_id?: number | string;
    display_name?: string;
    lat?: string;
    lon?: string;
  }>;

  return payload
    .map((item) => ({
      id: String(item.place_id ?? ''),
      label: item.display_name ?? '',
      lat: Number(item.lat),
      lng: Number(item.lon),
    }))
    .filter(
      (item) =>
        Boolean(item.id) &&
        Boolean(item.label) &&
        Number.isFinite(item.lat) &&
        Number.isFinite(item.lng)
    );
}
