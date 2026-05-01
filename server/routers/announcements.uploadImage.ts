import { z } from 'zod';
import { protectedProcedure } from '../_core/trpc';
import { storagePut } from '../storage';
import { TRPCError } from '@trpc/server';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const uploadImageProcedure = protectedProcedure
  .input(
    z.object({
      file: z.instanceof(File),
      announcementId: z.string().uuid(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(input.file.type)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Only image files are allowed (JPEG, PNG, WebP, GIF)',
      });
    }

    // Validate file size
    if (input.file.size > MAX_FILE_SIZE) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'File size exceeds 5MB limit',
      });
    }

    // Convert file to buffer
    const buffer = await input.file.arrayBuffer();

    // Generate unique key with random suffix to prevent enumeration
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileKey = `announcements/${ctx.user.id}/${input.announcementId}/${timestamp}-${randomSuffix}.jpg`;

    // Upload to S3
    const { url } = await storagePut(fileKey, Buffer.from(buffer), input.file.type);

    return { url, fileKey };
  });
