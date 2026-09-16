import { db } from '../db/schema';
import axios from 'axios';
import { getApiBaseUrl } from '../config';

const API_BASE = getApiBaseUrl();

export function getOrCreateDeviceToken(): string {
  let token = localStorage.getItem('shiksha_device_token');
  if (!token || token === 'DEV-OFFLINE-LOCAL-TOKEN') {
    token = `DEV-INST-${crypto.randomUUID()}`;
    localStorage.setItem('shiksha_device_token', token);
  }
  return token;
}

export async function processOutboxSync() {
  if (!navigator.onLine) {
    return { synced: 0, status: 'offline' };
  }

  // Get session & device token
  const session = await db.session.toCollection().first();
  const deviceToken = getOrCreateDeviceToken();

  if (!session || !session.access_token) {
    return { synced: 0, status: 'no_auth' };
  }

  const pendingItems = await db.outbox
    .where('status')
    .equals('PENDING')
    .toArray();

  if (pendingItems.length === 0) {
    return { synced: 0, status: 'idle' };
  }

  // Mark items as SYNCING
  const batchIds = pendingItems.map(i => i.id!).filter(Boolean);
  await db.outbox.where('id').anyOf(batchIds).modify({ status: 'SYNCING' });

  const batchId = `BATCH-${Date.now()}`;
  const pushPayload = {
    device_token: deviceToken,
    sync_batch_id: batchId,
    operations: pendingItems.map(item => ({
      client_tx_id: item.client_tx_id,
      entity_name: item.entity_name,
      operation_type: item.operation_type,
      client_timestamp: item.client_timestamp,
      payload: item.payload
    }))
  };

  try {
    const res = await axios.post(`${API_BASE}/sync/push`, pushPayload, {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    const results = res.data.results || [];
    let syncedCount = 0;

    for (const resItem of results) {
      const outboxRow = pendingItems.find(p => p.client_tx_id === resItem.client_tx_id);
      if (outboxRow && outboxRow.id) {
        if (resItem.status === 'SUCCESS' || resItem.status === 'DUPLICATE') {
          await db.outbox.delete(outboxRow.id);
          syncedCount++;
        } else {
          await db.outbox.update(outboxRow.id, {
            status: 'FAILED_NEEDS_ATTENTION',
            error_message: resItem.error_message || 'Sync failed on server'
          });
        }
      }
    }

    return { synced: syncedCount, status: 'success' };
  } catch (err: any) {
    // Revert status to PENDING for retry
    await db.outbox.where('id').anyOf(batchIds).modify({ status: 'PENDING' });
    return { synced: 0, status: 'error', error: err.message };
  }
}
