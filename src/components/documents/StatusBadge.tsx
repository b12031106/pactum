'use client';

import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n/context';
import type { DocumentStatus } from '@/types';

const variantMap: Record<DocumentStatus, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary',
  in_review: 'outline',
  approved: 'default',
};

const labelKeyMap: Record<DocumentStatus, string> = {
  draft: 'status.draft',
  in_review: 'status.inReview',
  approved: 'status.approved',
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const { t } = useI18n();
  const variant = variantMap[status] ?? variantMap.draft;
  const label = t(labelKeyMap[status] ?? 'status.draft');
  return <Badge variant={variant}>{label}</Badge>;
}
