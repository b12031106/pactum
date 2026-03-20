import { Badge } from '@/components/ui/badge';
import type { DocumentStatus } from '@/types';

const statusConfig: Record<DocumentStatus, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  in_review: { label: 'In Review', variant: 'default' },
  approved: { label: 'Approved', variant: 'outline' },
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const config = statusConfig[status] || statusConfig.draft;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
