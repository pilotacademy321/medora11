/**
 * Session, Storage & Cache Isolation Helpers for MEDORA
 *
 * Ensures complete cleanup on logout, permanent account deletion, or account switching
 * so no prior user's profile, role, notification read state, or portal state ever bleeds
 * into a new login or registration session.
 */

import { clearFirestoreMemoryCache } from '../lib/firestoreCache';

const KNOWN_USER_STORAGE_KEYS = [
  'm737_demo_role_v1',
  'm737_device_fcm_token_v1',
  'm737_push_preferences_v1',
  'm737_system_audit_logs',
  'm737_audit_logs_cache_v1',
  'm737_read_notifications_v1',
  'medora_notif_banner_dismissed_v1',
];

const USER_KEY_PREFIXES = ['m737_', 'medora_'];

export interface SessionCleanupOptions {
  preserveKeys?: string[];
  clearServiceWorkerCaches?: boolean;
}

/**
 * Clears all MEDORA user-scoped localStorage and sessionStorage entries,
 * plus optional non-precached runtime Service Worker caches.
 */
export async function clearAllUserSessionCaches(
  options: SessionCleanupOptions = {}
): Promise<string[]> {
  clearFirestoreMemoryCache();
  const preserve = new Set(options.preserveKeys || []);
  const removedKeys: string[] = [];

  if (typeof window !== 'undefined') {
    try {
      const storage = window.localStorage;
      if (storage) {
        for (const key of KNOWN_USER_STORAGE_KEYS) {
          if (!preserve.has(key) && storage.getItem(key) !== null) {
            storage.removeItem(key);
            removedKeys.push(key);
          }
        }

        // Sweep any dynamic m737_ / medora_ keys (excluding Firebase Auth SDK keys & preserved prefs)
        const allKeys: string[] = [];
        for (let i = 0; i < storage.length; i += 1) {
          const k = storage.key(i);
          if (k) allKeys.push(k);
        }
        for (const key of allKeys) {
          if (preserve.has(key)) continue;
          if (USER_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
            storage.removeItem(key);
            if (!removedKeys.includes(key)) removedKeys.push(key);
          }
        }
      }
    } catch {
      // Ignore storage access errors in restricted frames
    }

    try {
      window.sessionStorage?.clear();
    } catch {
      // Ignore sessionStorage errors
    }

    if (options.clearServiceWorkerCaches !== false && 'caches' in window) {
      try {
        const cacheNames = await window.caches.keys();
        await Promise.all(
          cacheNames
            .filter((name) => !name.includes('workbox-precache'))
            .map((name) => window.caches.delete(name))
        );
      } catch {
        // Ignore Cache API errors
      }
    }
  }

  return removedKeys;
}

/**
 * Normalizes email addresses consistently for identity & tombstone matching.
 */
export function normalizeEmailKey(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}
