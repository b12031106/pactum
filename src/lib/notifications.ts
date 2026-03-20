import { prisma } from '@/lib/prisma';
import { pushToSSE } from '@/lib/sse';
import { sendEmail } from '@/lib/email';
import { sendSlack } from '@/lib/slack';

export type NotificationType =
  | 'review_started'
  | 'document_signed'
  | 'document_approved'
  | 'discussion_resolve_started'
  | 'discussion_resolved'
  | 'all_discussions_resolved'
  | 'comment_added'
  | 'mentioned';

interface NotificationPayload {
  documentId?: string;
  documentTitle?: string;
  actorName?: string;
  message: string;
  [key: string]: unknown;
}

interface SendNotificationOptions {
  type: NotificationType;
  recipientIds: string[];
  payload: NotificationPayload;
  documentId?: string;
}

export async function sendNotification(options: SendNotificationOptions): Promise<void> {
  const { type, recipientIds, payload, documentId } = options;

  if (recipientIds.length === 0) return;

  // 1. Bulk insert into DB
  const notifications = await prisma.$transaction(
    recipientIds.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          documentId: documentId ?? null,
          type,
          payload: payload as unknown as import('@prisma/client').Prisma.InputJsonValue,
        },
        include: { user: { select: { email: true, notificationPrefs: true, slackWebhookUrl: true } } },
      }),
    ),
  );

  // 2. Push to SSE (real-time in-app)
  for (let i = 0; i < recipientIds.length; i++) {
    const n = notifications[i];
    pushToSSE(recipientIds[i], {
      id: n.id,
      type: n.type,
      payload: n.payload,
      documentId: n.documentId,
      createdAt: n.createdAt.toISOString(),
    });
  }

  // 3. Email + Slack (async, fire-and-forget)
  for (const notification of notifications) {
    const prefs = (notification.user.notificationPrefs ?? { inApp: true, email: true, slack: false }) as { inApp?: boolean; email?: boolean; slack?: boolean };

    if (prefs.email && notification.user.email) {
      sendEmail({
        to: notification.user.email,
        subject: `[Pactum] ${payload.message}`,
        html: `<p>${payload.message}</p>${
          documentId ? `<p><a href="${process.env.NEXTAUTH_URL}/documents/${documentId}">View Document</a></p>` : ''
        }`,
      }).catch(() => {});
    }

    if (prefs.slack && notification.user.slackWebhookUrl) {
      sendSlack(notification.user.slackWebhookUrl, {
        text: `[Pactum] ${payload.message}${
          documentId ? ` — ${process.env.NEXTAUTH_URL}/documents/${documentId}` : ''
        }`,
      }).catch(() => {});
    }
  }
}

/**
 * Helper: get all user IDs with specific roles for a document.
 */
export async function getRecipientsByRoles(
  documentId: string,
  creatorId: string,
  roles: string[],
  excludeUserId?: string,
): Promise<string[]> {
  const ids = new Set<string>();

  if (roles.includes('creator')) {
    ids.add(creatorId);
  }

  if (roles.some((r) => r !== 'creator')) {
    const members = await prisma.documentMember.findMany({
      where: {
        documentId,
        role: { in: roles.filter((r) => r !== 'creator') },
      },
      select: { userId: true },
    });
    members.forEach((m) => ids.add(m.userId));
  }

  if (excludeUserId) ids.delete(excludeUserId);
  return Array.from(ids);
}
