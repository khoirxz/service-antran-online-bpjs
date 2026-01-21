/**
 * Schedule Cache Manager - Handle refresh locks and deduplication
 * Prevents thundering herd problem when schedule is missing
 */

interface RefreshLock {
  poli_id: string;
  tanggal: string;
  refreshing: boolean;
  lastRefreshed: Date;
  lastError?: Error;
}

// In-memory cache: key = "poli_id:tanggal"
const refreshCache = new Map<string, RefreshLock>();

/**
 * Get refresh lock for a poli+tanggal combo
 */
export function getRefreshLock(
  poliId: string,
  tanggal: string,
): RefreshLock | undefined {
  const key = `${poliId}:${tanggal}`;
  const lock = refreshCache.get(key);

  // Check if cache expired (5 minutes)
  if (lock && Date.now() - lock.lastRefreshed.getTime() > 5 * 60 * 1000) {
    refreshCache.delete(key);
    return undefined;
  }

  return lock;
}

/**
 * Set refresh lock as in-flight
 */
export function setRefreshLock(poliId: string, tanggal: string): void {
  const key = `${poliId}:${tanggal}`;
  refreshCache.set(key, {
    poli_id: poliId,
    tanggal,
    refreshing: true,
    lastRefreshed: new Date(),
  });
}

/**
 * Mark refresh lock as completed
 */
export function completeRefreshLock(poliId: string, tanggal: string): void {
  const key = `${poliId}:${tanggal}`;
  const lock = refreshCache.get(key);
  if (lock) {
    lock.refreshing = false;
    lock.lastRefreshed = new Date();
  }
}

/**
 * Mark refresh lock with error (circuit breaker)
 */
export function setRefreshError(
  poliId: string,
  tanggal: string,
  error: Error,
): void {
  const key = `${poliId}:${tanggal}`;
  const lock = refreshCache.get(key);
  if (lock) {
    lock.refreshing = false;
    lock.lastError = error;
    lock.lastRefreshed = new Date();
  }
}

/**
 * Check if should circuit break (fail fast)
 * Returns true jika recent error dan masih within circuit open window
 */
export function isCircuitOpen(poliId: string, tanggal: string): boolean {
  const lock = getRefreshLock(poliId, tanggal);

  if (!lock || !lock.lastError) {
    return false;
  }

  // Circuit open untuk 10 menit setelah error
  const circuitOpenDuration = 10 * 60 * 1000;
  return Date.now() - lock.lastRefreshed.getTime() < circuitOpenDuration;
}

/**
 * Clear cache (useful for testing/manual reset)
 */
export function clearRefreshCache(): void {
  refreshCache.clear();
}

/**
 * Get cache stats for monitoring
 */
export function getRefreshCacheStats(): {
  totalLocks: number;
  refreshing: number;
  failed: number;
} {
  const stats = {
    totalLocks: refreshCache.size,
    refreshing: 0,
    failed: 0,
  };

  for (const lock of refreshCache.values()) {
    if (lock.refreshing) stats.refreshing++;
    if (lock.lastError) stats.failed++;
  }

  return stats;
}
