import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, needsSignoff } from '@/lib/permissions';
import { getDocsGitService } from '@/lib/git';

// POST /api/documents/:id/signoff — sign off on a document
export const POST = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: { members: true },
  });

  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  if (document.status !== 'in_review') {
    throw new ApiError(409, 'INVALID_STATUS', 'Document must be in_review to sign off');
  }

  // Check no open discussions
  const openDiscussionCount = await prisma.discussion.count({
    where: { documentId: id, status: 'open' },
  });

  if (openDiscussionCount > 0) {
    throw new ApiError(422, 'OPEN_DISCUSSIONS', 'All discussions must be resolved before signing off');
  }

  const roles = await getDocumentRoles(session.user.id, document.createdBy, id);
  if (!needsSignoff(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'You are not required to sign off on this document');
  }

  // Check not already signed
  const existingSignoff = await prisma.documentSignoff.findUnique({
    where: { documentId_userId: { documentId: id, userId: session.user.id } },
  });

  if (existingSignoff) {
    throw new ApiError(409, 'ALREADY_SIGNED', 'You have already signed off on this document');
  }

  // Get latest commit SHA
  const latestCommit = await prisma.documentGitCommit.findFirst({
    where: { documentId: id },
    orderBy: { committedAt: 'desc' },
  });

  // Insert signoff
  await prisma.documentSignoff.create({
    data: {
      documentId: id,
      userId: session.user.id,
      commitSha: latestCommit?.commitSha ?? null,
    },
  });

  // Build required signers set: creator + editors + approvers
  const requiredUserIds = new Set<string>();
  requiredUserIds.add(document.createdBy);
  for (const member of document.members) {
    if (member.role === 'editor' || member.role === 'approver') {
      requiredUserIds.add(member.userId);
    }
  }

  // Check if all required signers have signed
  const signoffCount = await prisma.documentSignoff.count({
    where: { documentId: id, userId: { in: [...requiredUserIds] } },
  });

  const allSigned = signoffCount >= requiredUserIds.size;

  if (allSigned) {
    // Auto-approve
    const signoffs = await prisma.documentSignoff.findMany({
      where: { documentId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const signerMap = new Map(signoffs.map((s) => [s.userId, s]));

    const signerNames = [...requiredUserIds]
      .map((uid) => signerMap.get(uid)?.user.name ?? uid)
      .join(', ');

    const git = getDocsGitService();
    const author = { name: session.user.name, email: session.user.email };

    const bodyLines = ['簽署紀錄:'];
    for (const uid of requiredUserIds) {
      const s = signerMap.get(uid);
      if (s) {
        bodyLines.push(`- ${s.user.name} <${s.user.email}> signed at ${s.signedAt.toISOString()}`);
      }
    }

    const commitSha = await git.commitWithMetadata(
      document.gitFile,
      'approved',
      `docs: approved - ${document.title} / signed by: ${signerNames}`,
      author,
      bodyLines.join('\n'),
    );

    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id },
        data: { status: 'approved' },
      });

      await tx.documentGitCommit.create({
        data: {
          documentId: id,
          commitSha,
          eventType: 'approved',
          summary: `Approved with all signoffs: ${signerNames}`,
          triggeredBy: session.user.id,
        },
      });
    });

    // TODO(Phase 8): Notify all document members

    return NextResponse.json({ data: { signed: true, allSigned: true, status: 'approved' } });
  }

  // TODO(Phase 8): Notify creator "{name} 已完成畫押"

  return NextResponse.json({ data: { signed: true, allSigned: false } });
});
