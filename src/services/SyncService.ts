/**
 * SyncService.ts  (v2)
 * Syncs pending attendance to AWS with retry, auto-trigger on reconnect, and purge.
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import db from './DatabaseService';

// ─── AWS Config (replace before deployment) ───────────────────────────────────
const AWS_ENDPOINT =
  'https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/prod/attendance';
const AWS_API_KEY  = 'YOUR_API_KEY_HERE';
const BATCH_SIZE   = 100;
const MAX_RETRIES  = 3;

// ─── State ─────────────────────────────────────────────────────────────────────
let unsubscribe: (() => void) | null = null;
let isSyncing = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function postWithRetry(body: object): Promise<{ ok: boolean; status: number }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(AWS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': AWS_API_KEY,
        },
        body: JSON.stringify(body),
      });
      return { ok: res.ok, status: res.status };
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.warn(`[Sync] Attempt ${attempt} failed — retrying in ${attempt * 2}s`);
      await sleep(attempt * 2000);
    }
  }
  throw new Error('Max retries reached');
}

// ─── Core sync function ───────────────────────────────────────────────────────

export interface SyncResult {
  synced: number;
  purged: number;
  error?: string;
}

export async function syncAttendance(): Promise<SyncResult> {
  if (isSyncing) {
    console.log('[Sync] Already in progress');
    return { synced: 0, purged: 0 };
  }

  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    console.log('[Sync] No network — skipping');
    return { synced: 0, purged: 0 };
  }

  isSyncing = true;
  let totalSynced = 0;
  let totalPurged = 0;

  try {
    // Sync in batches
    while (true) {
      const pending = await db.getPendingAttendance(BATCH_SIZE);
      if (pending.length === 0) break;

      console.log(`[Sync] Posting batch of ${pending.length}`);

      const payload = {
        records: pending.map(r => ({
          id:         r.id,
          person_id:  r.person_id,
          timestamp:  r.timestamp,
          confidence: r.confidence,
          liveness_ok: r.liveness_ok === 1,
          location:   (r.lat != null && r.lon != null)
            ? { lat: r.lat, lon: r.lon }
            : null,
        })),
      };

      const res = await postWithRetry(payload);

      if (res.ok) {
        await db.markSynced(pending.map(r => r.id));
        totalSynced += pending.length;
        console.log(`[Sync] ✅ Batch synced (${pending.length} records)`);
      } else {
        console.error(`[Sync] Server error ${res.status}`);
        break;
      }
    }

    // Purge old synced records
    totalPurged = await db.purgeOldRecords();
    if (totalPurged > 0) {
      console.log(`[Sync] 🗑️ Purged ${totalPurged} records older than 30 days`);
    }

    return { synced: totalSynced, purged: totalPurged };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[Sync] Failed:', error);
    return { synced: totalSynced, purged: totalPurged, error };
  } finally {
    isSyncing = false;
  }
}

// ─── NetInfo listener ────────────────────────────────────────────────────────

export function startSyncListener(): void {
  if (unsubscribe) return;
  let wasOffline = false;

  unsubscribe = NetInfo.addEventListener(async (state: NetInfoState) => {
    const online = state.isConnected ?? false;
    if (!online) {
      wasOffline = true;
    } else if (wasOffline && online) {
      wasOffline = false;
      console.log('[Sync] 📶 Network restored — auto-syncing...');
      const r = await syncAttendance();
      console.log(`[Sync] Done: synced=${r.synced}, purged=${r.purged}`);
    }
  });

  console.log('[Sync] Network listener started');
}

export function stopSyncListener(): void {
  unsubscribe?.();
  unsubscribe = null;
}

export const SyncService = { syncAttendance, startSyncListener, stopSyncListener };
export default SyncService;
