import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

const userSelect = { id: true, name: true, email: true, avatarUrl: true };

// GET /api/discussions/:discussionId
export const GET = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { discussionId } = await context!.params;

  const discussion = await prisma.discussion.findUnique({
    where: { id: discussionId },
    include: {
      creator: { select: userSelect },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: userSelect } },
      },
      signoffs: {
        include: { user: { select: userSelect } },
      },
    },
  });

  if (!discussion) throw new ApiError(404, 'NOT_FOUND', 'Discussion not found');

  return NextResponse.json({ data: discussion });
});
