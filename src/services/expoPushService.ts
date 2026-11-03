/**
 * Expo Push Notification Service
 * Handles batching, dispatching to Expo Push API, ticket parsing, and receipt reconciliation.
 */

import { ExpoPushMessage, ExpoPushTicket, ExpoPushReceipt } from '../models/notificationModel';
import { deactivateInvalidToken } from './deviceService';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const CHUNK_SIZE_MESSAGES = 100;
const CHUNK_SIZE_RECEIPTS = 300;

/**
 * Split an array into chunks of given size
 */
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get headers for Expo API requests
 */
function getExpoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
  };

  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (accessToken && accessToken.trim()) {
    headers['Authorization'] = `Bearer ${accessToken.trim()}`;
  }

  return headers;
}

/**
 * Send a list of push messages to Expo Push API in bounded chunks
 */
export async function sendPushChunked(
  messages: ExpoPushMessage[]
): Promise<Array<{ message: ExpoPushMessage; ticket: ExpoPushTicket }>> {
  if (!messages || messages.length === 0) return [];

  const chunks = chunkArray(messages, CHUNK_SIZE_MESSAGES);
  const results: Array<{ message: ExpoPushMessage; ticket: ExpoPushTicket }> = [];

  for (const chunk of chunks) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: getExpoHeaders(),
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[expoPushService] HTTP Error ${response.status}:`, errorText);
        for (const msg of chunk) {
          results.push({
            message: msg,
            ticket: {
              status: 'error',
              message: `HTTP error ${response.status}`,
              details: { error: 'HttpError', status: response.status },
            },
          });
        }
        continue;
      }

      const json = (await response.json()) as any;
      const tickets: ExpoPushTicket[] = json?.data || [];

      for (let i = 0; i < chunk.length; i++) {
        const msg = chunk[i];
        const ticket = tickets[i] || { status: 'error', message: 'No ticket returned' };

        // If Expo indicates DeviceNotRegistered immediately in ticket, invalidate token
        if (
          ticket.status === 'error' &&
          ticket.details?.error === 'DeviceNotRegistered' &&
          typeof msg.to === 'string'
        ) {
          console.warn(`[expoPushService] Deactivating token: ${msg.to} (DeviceNotRegistered)`);
          deactivateInvalidToken(msg.to, 'DeviceNotRegistered');
        }

        results.push({ message: msg, ticket });
      }
    } catch (err: any) {
      console.error('[expoPushService] Network or dispatch error sending push chunk:', err);
      for (const msg of chunk) {
        results.push({
          message: msg,
          ticket: {
            status: 'error',
            message: err?.message || 'Network error',
            details: { error: 'NetworkError' },
          },
        });
      }
    }
  }

  return results;
}

/**
 * Fetch receipts for tickets from Expo Push API
 */
export async function fetchReceipts(
  ticketIds: string[]
): Promise<Record<string, ExpoPushReceipt>> {
  if (!ticketIds || ticketIds.length === 0) return {};

  const chunks = chunkArray(ticketIds, CHUNK_SIZE_RECEIPTS);
  const receiptMap: Record<string, ExpoPushReceipt> = {};

  for (const chunk of chunks) {
    try {
      const response = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: getExpoHeaders(),
        body: JSON.stringify({ ids: chunk }),
      });

      if (!response.ok) {
        console.error(`[expoPushService] Receipt fetch error HTTP ${response.status}`);
        continue;
      }

      const json = (await response.json()) as any;
      const data: Record<string, ExpoPushReceipt> = json?.data || {};

      for (const [ticketId, receipt] of Object.entries(data)) {
        receiptMap[ticketId] = receipt;
      }
    } catch (err) {
      console.error('[expoPushService] Error fetching receipts:', err);
    }
  }

  return receiptMap;
}
