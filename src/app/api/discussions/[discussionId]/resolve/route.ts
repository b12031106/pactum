import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, canResolveDiscussion } from '@/lib/permissions';

// POST /api/discussions/:discussionId/resolve
export const POST = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { discussionId } = await context!.params;

  const discussion = await prisma.discussion.findUnique({
    where: { id: discussionId },
    include: { document: true },
  });

  if (!discussion) throw new ApiError(404, 'NOT_FOUND', 'Discussion not found');

  if (discussion.status !== 'open') {
    throw new ApiError(409, 'INVALID_STATUS', 'Discussion is not open');
  }

  if (discussion.cta) {
    throw new ApiError(409, 'CTA_ALREADY_SET', 'CTA has already been set for this discussion');
  }

  const roles = await getDocumentRoles(
    session.user.id,
    discussion.document.createdBy,
    discussion.documentId,
  );

  if (!canResolveDiscussion(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to resolve discussions');
  }

  const body = await req.json();
  const { cta } = body as { cta?: string };

  if (!cta || (cta !== 'no_change' && cta !== 'need_change')) {
    throw new ApiError(400, 'INVALID_INPUT', 'cta must be "no_change" or "need_change"');
  }

  const updated = await prisma.discussion.update({
    where: { id: discussionId },
    data: { cta },
    include: {
      creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      signoffs: true,
    },
  });

  // TODO(Phase 8): Notify all editor + approver

  return NextResponse.json({ data: updated });
});
