import 'server-only';

import type { DocumentRole } from '@/types';
import { prisma } from '@/lib/prisma';

export async function getDocumentRoles(
  userId: string,
  documentCreatedBy: string,
  documentId: string,
): Promise<DocumentRole[]> {
  if (userId === documentCreatedBy) return ['creator'];

  const members = await prisma.documentMember.findMany({
    where: { documentId, userId },
  });

  if (members.length === 0) return ['viewer'];

  return members.map((m) => m.role as DocumentRole);
}
