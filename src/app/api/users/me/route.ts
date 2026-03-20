import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { apiHandler, ApiError } from '@/lib/api-handler';

export const GET = apiHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      notificationPrefs: true,
      slackWebhookUrl: true,
    },
  });

  return NextResponse.json({ data: user });
});

export const PATCH = apiHandler(async (req) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new ApiError(401, 'UNAUTHORIZED', 'Unauthorized');

  const body = await req.json();
  const { notificationPrefs, slackWebhookUrl } = body as {
    notificationPrefs?: { inApp?: boolean; email?: boolean; slack?: boolean };
    slackWebhookUrl?: string | null;
  };

  const data: Record<string, unknown> = {};
  if (notificationPrefs !== undefined) data.notificationPrefs = notificationPrefs;
  if (slackWebhookUrl !== undefined) data.slackWebhookUrl = slackWebhookUrl;

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      notificationPrefs: true,
      slackWebhookUrl: true,
    },
  });

  return NextResponse.json({ data: user });
});
