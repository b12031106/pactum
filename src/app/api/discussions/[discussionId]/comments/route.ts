import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

const userSelect = { id: true, name: true, email: true, avatarUrl: true };

// POST /api/discussions/:discussionId/comments
export const POST = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { discussionId } = await context!.params;

  const discussion = await prisma.discussion.findUnique({
    where: { id: discussionId },
  });

  if (!discussion) throw new ApiError(404, 'NOT_FOUND', 'Discussion not found');

  if (discussion.status === 'resolved') {
    throw new ApiError(409, 'DISCUSSION_RESOLVED', 'Cannot comment on a resolved discussion');
  }

  const body = await req.json();
  const { content } = body as { content?: string };

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    throw new ApiError(400, 'INVALID_INPUT', 'content must not be empty');
  }

  const comment = await prisma.discussionComment.create({
    data: {
      discussionId,
      authorId: session.user.id,
      content: content.trim(),
    },
    include: {
      author: { select: userSelect },
    },
  });

  return NextResponse.json({ data: comment }, { status: 201 });
});
