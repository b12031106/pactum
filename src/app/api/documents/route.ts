import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateDocumentId } from '@/lib/ulid';
import { getDocsGitService } from '@/lib/git';
import { apiHandler, ApiError } from '@/lib/api-handler';

// POST /api/documents — Create document
export const POST = apiHandler(async (req) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const body = await req.json();
  const { title, tags } = body as { title: string; tags?: string[] };

  if (!title?.trim()) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Title is required');
  }

  const id = generateDocumentId();
  const gitFile = `${id}.md`;

  const document = await prisma.document.create({
    data: {
      id,
      title: title.trim(),
      gitFile,
      createdBy: session.user.id,
      tags: tags?.length
        ? { create: tags.map((tag: string) => ({ tag: tag.trim() })) }
        : undefined,
    },
    include: { tags: true, creator: true },
  });

  const git = getDocsGitService();
  const initialContent = `# ${title.trim()}\n`;
  const sha = await git.commitFile(
    gitFile,
    initialContent,
    `docs: create - ${title.trim()}`,
    { name: session.user.name, email: session.user.email },
  );

  await prisma.documentGitCommit.create({
    data: {
      documentId: id,
      commitSha: sha,
      eventType: 'create',
      summary: `docs: create - ${title.trim()}`,
      triggeredBy: session.user.id,
    },
  });

  return NextResponse.json({ data: document }, { status: 201 });
});

// GET /api/documents — List documents
export const GET = apiHandler(async (req) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const tag = searchParams.get('tag');
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (status) {
    where.status = status;
  }

  if (tag) {
    const tags = tag.split(',').map((t) => t.trim());
    where.AND = tags.map((t: string) => ({ tags: { some: { tag: t } } }));
  }

  if (search) {
    where.title = { contains: search, mode: 'insensitive' };
  }

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        tags: true,
        creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.document.count({ where }),
  ]);

  return NextResponse.json({
    data: documents,
    pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  });
});
