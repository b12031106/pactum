import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

// GET /api/documents/:id/signoffs — returns signoff progress
export const GET = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: { members: true },
  });

  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  // Build required signers set: creator + editors + approvers
  const requiredUserIds = new Set<string>();
  requiredUserIds.add(document.createdBy);
  for (const member of document.members) {
    if (member.role === 'editor' || member.role === 'approver') {
      requiredUserIds.add(member.userId);
    }
  }

  // Fetch actual signoffs with user details
  const signoffs = await prisma.documentSignoff.findMany({
    where: { documentId: id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });

  const signoffMap = new Map(signoffs.map((s) => [s.userId, s]));

  // Fetch required signer user details
  const requiredUsers = await prisma.user.findMany({
    where: { id: { in: [...requiredUserIds] } },
    select: { id: true, name: true, email: true, avatarUrl: true },
  });

  const progress = requiredUsers.map((user) => {
    const signoff = signoffMap.get(user.id);
    return {
      user,
      signed: !!signoff,
      signedAt: signoff?.signedAt ?? null,
    };
  });

  const signedCount = progress.filter((p) => p.signed).length;

  return NextResponse.json({
    data: {
      progress,
      total: requiredUserIds.size,
      signed: signedCount,
      allSigned: signedCount >= requiredUserIds.size,
    },
  });
});
