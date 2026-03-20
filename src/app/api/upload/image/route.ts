import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { uploadToR2 } from '@/lib/r2';
import { apiHandler, ApiError } from '@/lib/api-handler';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export const POST = apiHandler(async (req) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const formData = await req.formData();
  const image = formData.get('image');
  const documentId = formData.get('documentId');

  if (!image || !(image instanceof File)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Image file is required');
  }

  if (!documentId || typeof documentId !== 'string') {
    throw new ApiError(422, 'VALIDATION_ERROR', 'documentId is required');
  }

  if (!ALLOWED_TYPES.includes(image.type)) {
    throw new ApiError(422, 'VALIDATION_ERROR', `Invalid image type. Allowed: ${ALLOWED_TYPES.join(', ')}`);
  }

  if (image.size > MAX_SIZE) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Image size exceeds 10MB limit');
  }

  const ext = EXT_MAP[image.type] || 'bin';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  const key = `documents/${documentId}/${timestamp}-${random}.${ext}`;

  const buffer = Buffer.from(await image.arrayBuffer());
  const url = await uploadToR2(key, buffer, image.type);

  return NextResponse.json({ data: { url } });
});
