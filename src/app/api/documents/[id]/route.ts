import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

// GET /api/documents/:id
export const GET = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      tags: true,
      creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      },
      signoffs: {
        include: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      },
      locker: { select: { id: true, name: true } },
    },
  });

  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  return NextResponse.json({ data: document });
});

// PATCH /api/documents/:id
export const PATCH = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: { discussions: { where: { status: 'open', cta: 'need_change' } } },
  });

  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  // Permission check
  const isCreator = document.createdBy === session.user.id;
  const editorMembership = await prisma.documentMember.findMany({
    where: { documentId: id, userId: session.user.id, role: 'editor' },
  });
  const canEdit = isCreator || editorMembership.length > 0;

  if (!canEdit) throw new ApiError(403, 'FORBIDDEN', 'You do not have edit permission');

  if (document.status === 'approved') {
    throw new ApiError(409, 'INVALID_STATUS', 'Cannot edit an approved document');
  }

  if (document.status === 'in_review') {
    const hasNeedChange = document.discussions.length > 0;
    if (!hasNeedChange) {
      throw new ApiError(409, 'INVALID_STATUS', 'Cannot edit during review without a need_change discussion');
    }
  }

  if (document.lockedBy && document.lockedBy !== session.user.id) {
    const locker = await prisma.user.findUnique({ where: { id: document.lockedBy } });
    throw new ApiError(409, 'DOCUMENT_LOCKED', `${locker?.name || 'Someone'} is currently editing`);
  }

  const body = await req.json();
  const { content, title, anchorUpdates } = body as {
    content?: unknown;
    title?: string;
    anchorUpdates?: Array<{ discussionId: string; from?: number; to?: number; anchor?: null }>;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};
  if (content !== undefined) updateData.content = content;
  if (title !== undefined) updateData.title = title;

  const updated = await prisma.$transaction(async (tx) => {
    const doc = await tx.document.update({
      where: { id },
      data: updateData,
      include: {
        tags: true,
        creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    if (anchorUpdates?.length) {
      for (const update of anchorUpdates) {
        if (update.anchor === null) {
          await tx.discussion.update({
            where: { id: update.discussionId },
            data: { anchorData: { invalid: true } },
          });
        } else if (update.from !== undefined && update.to !== undefined) {
          await tx.discussion.update({
            where: { id: update.discussionId },
            data: { anchorData: { from: update.from, to: update.to } },
          });
        }
      }
    }

    return doc;
  });

  return NextResponse.json({ data: updated });
});
