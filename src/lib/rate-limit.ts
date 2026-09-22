const attempts = new Map<string, { count: number; resetAt: number }>();

export function allowRequest(key: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  if (attempts.size > 2_000) for (const [id, entry] of attempts) if (entry.resetAt <= now) attempts.delete(id);
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}
