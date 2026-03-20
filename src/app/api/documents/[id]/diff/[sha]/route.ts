import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';
import { getDocsGitService } from '@/lib/git';

export const GET = apiHandler(async (_req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id, sha } = await context!.params;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  // Verify commit belongs to this document
  const commit = await prisma.documentGitCommit.findFirst({
    where: { documentId: id, commitSha: sha },
  });
  if (!commit) throw new ApiError(404, 'NOT_FOUND', 'Commit not found for this document');

  const git = getDocsGitService();
  const diff = await git.getDiff(sha, document.gitFile);

  return NextResponse.json({ data: { sha, diff, summary: commit.summary, eventType: commit.eventType } });
});
