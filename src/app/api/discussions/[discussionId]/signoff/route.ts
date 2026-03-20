import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocumentRoles, needsSignoff } from '@/lib/permissions';
import { getDocsGitService } from '@/lib/git';
import { tiptapJsonToMarkdown } from '@/lib/markdown';
import { sendNotification } from '@/lib/notifications';

// POST /api/discussions/:discussionId/signoff
export const POST = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { discussionId } = await context!.params;

  const discussion = await prisma.discussion.findUnique({
    where: { id: discussionId },
    include: {
      document: { include: { members: true } },
      comments: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!discussion) throw new ApiError(404, 'NOT_FOUND', 'Discussion not found');

  // 1. Check discussion open + cta set
  if (discussion.status !== 'open') {
    throw new ApiError(409, 'INVALID_STATUS', 'Discussion is not open');
  }

  if (!discussion.cta) {
    throw new ApiError(422, 'CTA_NOT_SET', 'CTA must be set before signing off');
  }

  // 2. Permission check — roles from the DOCUMENT
  const roles = await getDocumentRoles(
    session.user.id,
    discussion.document.createdBy,
    discussion.documentId,
  );

  if (!needsSignoff(roles)) {
    throw new ApiError(403, 'FORBIDDEN', 'You are not required to sign off on this discussion');
  }

  // 3. Check not already signed
  const existingSignoff = await prisma.discussionSignoff.findUnique({
    where: { discussionId_userId: { discussionId, userId: session.user.id } },
  });

  if (existingSignoff) {
    throw new ApiError(409, 'ALREADY_SIGNED', 'You have already signed off on this discussion');
  }

  // 4. Insert discussion_signoffs
  await prisma.discussionSignoff.create({
    data: {
      discussionId,
      userId: session.user.id,
    },
  });

  // 5. Check if ALL required signers (creator + editors + approvers of the DOCUMENT) have signed
  const requiredUserIds = new Set<string>();
  requiredUserIds.add(discussion.document.createdBy);
  for (const member of discussion.document.members) {
    if (member.role === 'editor' || member.role === 'approver') {
      requiredUserIds.add(member.userId);
    }
  }

  const signoffCount = await prisma.discussionSignoff.count({
    where: { discussionId, userId: { in: [...requiredUserIds] } },
  });

  const allSigned = signoffCount >= requiredUserIds.size;

  if (!allSigned) {
    // 7. Not all signed
    return NextResponse.json({ data: { signed: true, allSigned: false } });
  }

  // 6. All signed — resolve discussion
  // a. Generate resolution summary stub
  const concatenatedComments = discussion.comments
    .map((c) => c.content)
    .join(' ')
    .slice(0, 500);
  const resolution = `CTA: ${discussion.cta}. Summary: ${concatenatedComments}`;
  // TODO: Replace with LLM API call for AI summary

  // b–e. Update discussion, git commit, documentGitCommit in transaction
  const git = getDocsGitService();
  const document = discussion.document;
  const author = { name: session.user.name, email: session.user.email };

  // c. Write latest document content to git
  const markdown = tiptapJsonToMarkdown(document.content);
  const currentGitContent = await git.readFile(document.gitFile);
  const contentUnchanged = currentGitContent !== null && currentGitContent === markdown;

  const commitMessage = `docs: resolve discussion - ${document.title}`;
  const commitBody = `Discussion resolved with CTA: ${discussion.cta}\n\n${resolution}`;

  let commitSha: string;
  if (contentUnchanged) {
    commitSha = await git.commitWithMetadata(
      document.gitFile,
      'discussion_resolved',
      commitMessage,
      author,
      commitBody,
    );
  } else {
    commitSha = await git.commitFile(
      document.gitFile,
      markdown,
      commitMessage,
      author,
      commitBody,
    );
  }

  // b + d. Update discussion and create git commit record
  await prisma.$transaction(async (tx) => {
    await tx.discussion.update({
      where: { id: discussionId },
      data: {
        status: 'resolved',
        resolution,
        resolvedAt: new Date(),
        resolvedBy: session.user.id,
      },
    });

    // d. Create documentGitCommit record
    await tx.documentGitCommit.create({
      data: {
        documentId: document.id,
        commitSha,
        eventType: 'discussion_resolved',
        summary: resolution,
        triggeredBy: session.user.id,
      },
    });
  });

  // e. Check remaining open discussions count
  const remainingOpen = await prisma.discussion.count({
    where: { documentId: document.id, status: 'open' },
  });

  // f. Notify creator that discussion was resolved
  sendNotification({
    type: 'discussion_resolved',
    recipientIds: [discussion.document.createdBy],
    documentId: discussion.documentId,
    payload: {
      message: `Discussion resolved in "${discussion.document.title}"`,
      documentTitle: discussion.document.title,
    },
  }).catch(() => {});

  // If ALL discussions for the document are resolved
  if (remainingOpen === 0) {
    sendNotification({
      type: 'all_discussions_resolved',
      recipientIds: [discussion.document.createdBy],
      documentId: discussion.documentId,
      payload: {
        message: `All discussions resolved in "${discussion.document.title}" — ready for signoff`,
        documentTitle: discussion.document.title,
      },
    }).catch(() => {});
  }

  // g. Return result
  return NextResponse.json({
    data: {
      signed: true,
      allSigned: true,
      resolved: true,
      allDiscussionsResolved: remainingOpen === 0,
    },
  });
});
