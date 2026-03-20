import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { canManageMembers } from '@/lib/permissions';
import { getDocumentRoles } from '@/lib/permissions.server';
import type { MemberRole } from '@/types';

const VALID_ROLES: MemberRole[] = ['editor', 'advisor', 'approver'];

// PATCH /api/documents/:id/members/:uid — change role
export const PATCH = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id, uid } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    select: { id: true, createdBy: true },
  });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canManageMembers(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the creator can manage members');
  }

  if (uid === document.createdBy) {
    throw new ApiError(400, 'BAD_REQUEST', 'Cannot modify the creator');
  }

  const body = await req.json();
  const { oldRole, newRole } = body as { oldRole?: string; newRole?: string };

  if (!oldRole || !newRole) {
    throw new ApiError(400, 'BAD_REQUEST', 'oldRole and newRole are required');
  }

  if (!VALID_ROLES.includes(oldRole as MemberRole) || !VALID_ROLES.includes(newRole as MemberRole)) {
    throw new ApiError(400, 'BAD_REQUEST', `roles must be one of: ${VALID_ROLES.join(', ')}`);
  }

  const member = await prisma.$transaction(async (tx) => {
    const existing = await tx.documentMember.findFirst({
      where: { documentId: id, userId: uid, role: oldRole },
    });
    if (!existing) {
      throw new ApiError(404, 'NOT_FOUND', 'Member with that role not found');
    }

    await tx.documentMember.delete({ where: { id: existing.id } });

    return tx.documentMember.create({
      data: {
        documentId: id,
        userId: uid,
        role: newRole,
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
  });

  return NextResponse.json({ data: member });
});

// DELETE /api/documents/:id/members/:uid — remove all roles
export const DELETE = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id, uid } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    select: { id: true, createdBy: true },
  });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canManageMembers(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the creator can manage members');
  }

  if (uid === document.createdBy) {
    throw new ApiError(400, 'BAD_REQUEST', 'Cannot remove the creator');
  }

  await prisma.documentMember.deleteMany({
    where: { documentId: id, userId: uid },
  });

  return NextResponse.json({ data: { success: true } });
});
