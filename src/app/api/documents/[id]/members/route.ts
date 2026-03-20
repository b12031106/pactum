import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { canManageMembers } from '@/lib/permissions';
import { getDocumentRoles } from '@/lib/permissions.server';
import type { MemberRole } from '@/types';

const VALID_ROLES: MemberRole[] = ['editor', 'advisor', 'approver'];

// GET /api/documents/:id/members
export const GET = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({ where: { id }, select: { id: true } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const members = await prisma.documentMember.findMany({
    where: { documentId: id },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { addedAt: 'asc' },
  });

  return NextResponse.json({ data: members });
});

// POST /api/documents/:id/members
export const POST = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    select: { id: true, createdBy: true },
  });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canManageMembers(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the creator can manage members');
  }

  const body = await req.json();
  const { email, role } = body as { email?: string; role?: string };

  if (!email || !role) {
    throw new ApiError(400, 'BAD_REQUEST', 'email and role are required');
  }

  if (!VALID_ROLES.includes(role as MemberRole)) {
    throw new ApiError(400, 'BAD_REQUEST', `role must be one of: ${VALID_ROLES.join(', ')}`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  }

  if (user.id === document.createdBy) {
    throw new ApiError(400, 'BAD_REQUEST', 'Cannot add the creator as a member');
  }

  const member = await prisma.documentMember.upsert({
    where: {
      documentId_userId_role: {
        documentId: id,
        userId: user.id,
        role,
      },
    },
    update: {},
    create: {
      documentId: id,
      userId: user.id,
      role,
    },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({ data: member }, { status: 201 });
});
