import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { canStartReview } from '@/lib/permissions';
import { getDocumentRoles } from '@/lib/permissions.server';
import { getDocsGitService } from '@/lib/git';
import { tiptapJsonToMarkdown } from '@/lib/markdown';
import { sendNotification, getRecipientsByRoles } from '@/lib/notifications';

// POST /api/documents/:id/review — transition draft → in_review
export const POST = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: { members: true },
  });

  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canStartReview(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the creator can start a review');
  }

  if (document.status !== 'draft') {
    throw new ApiError(409, 'INVALID_STATUS', 'Document must be in draft status to start review');
  }

  const hasApprover = document.members.some((m) => m.role === 'approver');
  if (!hasApprover) {
    throw new ApiError(422, 'NO_APPROVER', 'At least one approver is required to start review');
  }

  const markdown = tiptapJsonToMarkdown(document.content);
  const git = getDocsGitService();
  const author = { name: session.user.name, email: session.user.email };

  const commitSha = await git.commitFile(
    document.gitFile,
    markdown,
    `docs: review started - ${document.title}`,
    author,
  );

  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id },
      data: { status: 'in_review' },
    });

    await tx.documentGitCommit.create({
      data: {
        documentId: id,
        commitSha,
        eventType: 'review_started',
        summary: `Review started for "${document.title}"`,
        triggeredBy: session.user.id,
      },
    });
  });

  const recipientIds = await getRecipientsByRoles(id, document.createdBy, ['editor', 'advisor', 'approver'], session.user.id);
  sendNotification({
    type: 'review_started',
    recipientIds,
    documentId: id,
    payload: {
      message: `${session.user.name} submitted "${document.title}" for review`,
      documentTitle: document.title,
      actorName: session.user.name,
    },
  }).catch(() => {});

  return NextResponse.json({ data: { status: 'in_review', commitSha } });
});
