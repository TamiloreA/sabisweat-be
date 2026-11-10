import { randomUUID } from 'crypto';
import { supabase } from '../config/database';

const DATA_URL_PREFIX = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/;
export const IMAGES_BUCKET = 'community-images';

export function parseBase64Image(input: string): {
  buffer: Buffer;
  contentType: string;
  extension: string;
} | null {
  if (!input || typeof input !== 'string') return null;

  const match = input.match(DATA_URL_PREFIX);
  const contentType = match?.[1] ?? 'image/jpeg';
  const raw = match ? input.slice(match[0].length) : input;
  const buffer = Buffer.from(raw, 'base64');

  if (buffer.length === 0) return null;

  const extension = contentType === 'image/png' ? 'png' : 'jpg';
  return { buffer, contentType, extension };
}

/**
 * Uploads a base64 encoded image to Supabase Storage and returns its public URL.
 */
export async function uploadBase64Image(
  folder: string,
  base64String: string
): Promise<string | null> {
  const parsed = parseBase64Image(base64String);
  if (!parsed) return null;

  const path = `${folder}/${randomUUID()}.${parsed.extension}`;
  const { error } = await supabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, parsed.buffer, { contentType: parsed.contentType });

  if (error) {
    console.warn(`[imageUpload] Upload to ${path} failed:`, error.message);
    return null;
  }

  const { data } = supabase.storage.from(IMAGES_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}

