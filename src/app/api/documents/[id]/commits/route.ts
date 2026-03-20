import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

export const GET = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const commits = await prisma.documentGitCommit.findMany({
    where: { documentId: id },
    orderBy: { committedAt: 'desc' },
    include: {
      trigger: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({ data: commits });
});
