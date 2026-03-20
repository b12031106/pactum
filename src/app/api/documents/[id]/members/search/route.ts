import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

export const GET = apiHandler(async (req, context) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const { id } = await context!.params;
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';

  const document = await prisma.document.findUnique({
    where: { id },
    select: {
      createdBy: true,
      creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      members: {
        select: {
          user: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
        distinct: ['userId'],
      },
    },
  });

  if (!document) throw new ApiError(404, 'NOT_FOUND', 'Document not found');

  const usersMap = new Map<
    string,
    { id: string; name: string; email: string; avatarUrl: string | null }
  >();
  usersMap.set(document.creator.id, document.creator);
  document.members.forEach((m) => usersMap.set(m.user.id, m.user));

  let users = Array.from(usersMap.values());

  if (q) {
    const lower = q.toLowerCase();
    users = users.filter(
      (u) => u.name.toLowerCase().includes(lower) || u.email.toLowerCase().includes(lower),
    );
  }

  users = users.filter((u) => u.id !== session.user.id);

  return NextResponse.json({ data: users.slice(0, 10) });
});
