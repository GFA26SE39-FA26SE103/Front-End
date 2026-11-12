export function recommendationReturnPath(state: unknown): string | undefined {
  if (!state || typeof state !== 'object' || !('recommendationReturn' in state)) return undefined;
  const target = state.recommendationReturn;
  return typeof target === 'string' && /^\/operator\/recommendations(?:\/[\w-]+)?(?:\?[^#]*)?$/.test(target)
    ? target : undefined;
}
