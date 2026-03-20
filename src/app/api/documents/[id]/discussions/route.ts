import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, canCreateDiscussion } from '@/lib/permissions';

const userSelect = { id: true, name: true, email: true, avatarUrl: true };

// GET /api/documents/:id/discussions
export const GET = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const url = new URL(req.url);
  const status = url.searchParams.get('status');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { documentId: id };
  if (status === 'open' || status === 'resolved') {
    where.status = status;
  }

  const discussions = await prisma.discussion.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      creator: { select: userSelect },
      comments: {
        take: 1,
        orderBy: { createdAt: 'asc' },
        include: { author: { select: userSelect } },
      },
      signoffs: {
        include: { user: { select: userSelect } },
      },
      _count: { select: { comments: true } },
    },
  });

  return NextResponse.json({ data: discussions });
});

// POST /api/documents/:id/discussions
export const POST = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canCreateDiscussion(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to create discussions');
  }

  const body = await req.json();
  const { anchorType, anchorData, content } = body as {
    anchorType?: string;
    anchorData?: unknown;
    content?: string;
  };

  if (!anchorType || (anchorType !== 'range' && anchorType !== 'line')) {
    throw new ApiError(400, 'INVALID_INPUT', 'anchorType must be "range" or "line"');
  }

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    throw new ApiError(400, 'INVALID_INPUT', 'content must not be empty');
  }

  const result = await prisma.$transaction(async (tx) => {
    const discussion = await tx.discussion.create({
      data: {
        documentId: id,
        createdBy: session.user.id,
        anchorType,
        anchorData: (anchorData ?? {}) as object,
      },
    });

    await tx.discussionComment.create({
      data: {
        discussionId: discussion.id,
        authorId: session.user.id,
        content: content.trim(),
      },
    });

    return tx.discussion.findUnique({
      where: { id: discussion.id },
      include: {
        creator: { select: userSelect },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: userSelect } },
        },
        signoffs: true,
        _count: { select: { comments: true } },
      },
    });
  });

  // TODO(Phase 8): Notify mentions + document creator

  return NextResponse.json({ data: result }, { status: 201 });
});
