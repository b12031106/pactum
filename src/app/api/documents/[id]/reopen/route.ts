import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, canReopen } from '@/lib/permissions';
import { getDocsGitService } from '@/lib/git';

// POST /api/documents/:id/reopen — transition in_review|approved → draft
export const POST = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const body = await req.json();
  const { reason } = body as { reason?: string };

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    throw new ApiError(422, 'REASON_REQUIRED', 'A reason is required to reopen');
  }

  const document = await prisma.document.findUnique({
    where: { id },
    include: { discussions: { select: { id: true } } },
  });

  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!canReopen(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only the creator can reopen a document');
  }

  if (document.status !== 'in_review' && document.status !== 'approved') {
    throw new ApiError(409, 'INVALID_STATUS', 'Document must be in_review or approved to reopen');
  }

  const previousStatus = document.status;
  const git = getDocsGitService();
  const author = { name: session.user.name, email: session.user.email };

  const commitBody = [
    `from: ${previousStatus}`,
    `reopened_by: ${session.user.name} <${session.user.email}>`,
    `time: ${new Date().toISOString()}`,
    `reason: ${reason.trim()}`,
  ].join('\n');

  const commitSha = await git.commitWithMetadata(
    document.gitFile,
    'reopen',
    `docs: reopened - ${document.title}`,
    author,
    commitBody,
  );

  const discussionIds = document.discussions.map((d) => d.id);

  await prisma.$transaction(async (tx) => {
    await tx.documentSignoff.deleteMany({ where: { documentId: id } });

    if (discussionIds.length > 0) {
      await tx.discussionSignoff.deleteMany({
        where: { discussionId: { in: discussionIds } },
      });
    }

    await tx.document.update({
      where: { id },
      data: { status: 'draft' },
    });

    await tx.documentGitCommit.create({
      data: {
        documentId: id,
        commitSha,
        eventType: 'reopen',
        summary: `Reopened from ${previousStatus}: ${reason.trim()}`,
        triggeredBy: session.user.id,
      },
    });
  });

  // TODO(Phase 8): Notify all editor, approver

  return NextResponse.json({ data: { status: 'draft', commitSha } });
});
