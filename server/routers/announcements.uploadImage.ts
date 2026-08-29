import { z } from 'zod';
import { adminProcedure } from '../_core/trpc';
import { storagePut } from '../storage';
import { createAdminClient } from '../../client/src/lib/supabase/server';
import { TRPCError } from '@trpc/server';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const BUCKET = 'announcement-images';
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

export const uploadImageProcedure = adminProcedure
  .input(
    // base64 over the JSON transport. `z.instanceof(File)` could never work:
    // httpBatchLink serializes to JSON and a File has no JSON representation,
    // so this procedure had never run successfully even before the Manus
    // storage backend died. `announcementId` is gone from the key too — the
    // uploader runs BEFORE the announcement exists (it defaults to the string
    // "new", which is not a uuid and failed the guard).
    z.object({
      base64: z.string().min(1),
      mimeType: z.string().min(1),
      fileName: z.string().max(255).optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(input.mimeType)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Only image files are allowed (JPEG, PNG, WebP, GIF)',
      });
    }

    // Validate file size (decoded, not base64 length)
    const buffer = Buffer.from(input.base64, 'base64');
    if (buffer.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'La imagen está vacía' });
    }
    if (buffer.length > MAX_FILE_SIZE) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'File size exceeds 5MB limit',
      });
    }

    // Unique key with a random suffix to prevent enumeration.
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const ext = EXT_BY_MIME[input.mimeType] ?? 'jpg';
    const fileKey = `${ctx.user.id}/${timestamp}-${randomSuffix}.${ext}`;

    const { path } = await storagePut(BUCKET, fileKey, buffer, input.mimeType);

    // PUBLIC bucket by design (non-PII novedad artwork rendered by <img src>),
    // so a stable public URL is correct here — unlike every other bucket in
    // this app. scripts/create_announcement_images_bucket.sh: "DO NOT upload
    // PII here."
    const { data } = createAdminClient().storage.from(BUCKET).getPublicUrl(path);

    return { url: data.publicUrl, path };
  });
