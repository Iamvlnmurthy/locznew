'use server';

import type { City } from '@locz/shared-types';
import { apiSafe } from '@/lib/api';

/**
 * Resolves device coordinates to a launched city. Returns `city: null` when the visitor
 * is outside every launched area — the picker then asks them to choose rather than
 * snapping them to a city hundreds of kilometres away.
 */
export async function resolveCoordinatesAction(
  latitude: number,
  longitude: number,
): Promise<{ city: City | null }> {
  const result = await apiSafe<{ city: City | null }>('/locations/resolve', {
    method: 'POST',
    body: { latitude, longitude },
  });

  return { city: result?.city ?? null };
}
