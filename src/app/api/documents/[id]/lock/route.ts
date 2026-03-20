import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { canEdit, canForceLock } from '@/lib/permissions';
import { getDocumentRoles } from '@/lib/permissions.server';

// POST /api/documents/:id/lock — acquire lock
export const POST = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    select: { id: true, createdBy: true, lockedBy: true },
  });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canEdit(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have edit permission');
  }

  // Atomically acquire lock only if null or already held by self
  const result = await prisma.document.updateMany({
    where: {
      id,
      OR: [
        { lockedBy: null },
        { lockedBy: session.user.id },
      ],
    },
    data: {
      lockedBy: session.user.id,
      lockedAt: new Date(),
    },
  });

  if (result.count === 0) {
    // Someone else holds the lock
    const doc = await prisma.document.findUnique({
      where: { id },
      include: { locker: { select: { id: true, name: true } } },
    });
    throw new ApiError(409, 'DOCUMENT_LOCKED', `${doc?.locker?.name || 'Someone'} is currently editing`);
  }

  return NextResponse.json({ data: { locked: true, lockedBy: session.user.id } });
});

// DELETE /api/documents/:id/lock — release lock
export const DELETE = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    select: { id: true, createdBy: true, lockedBy: true },
  });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);

  // Only lock owner or creator (canForceLock) can release
  const isLockOwner = document.lockedBy === session.user.id;
  if (!isLockOwner && !canForceLock(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the lock owner or creator can release the lock');
  }

  await prisma.document.update({
    where: { id },
    data: {
      lockedBy: null,
      lockedAt: null,
    },
  });

  return NextResponse.json({ data: { locked: false } });
});
