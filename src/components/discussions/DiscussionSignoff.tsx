'use client';

import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SignoffUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface Signoff {
  id: string;
  userId: string;
  user: SignoffUser;
  createdAt: string;
}

interface MemberRecord {
  id: string;
  userId: string;
  role: string;
  user: SignoffUser;
}

interface DiscussionSignoffProps {
  discussionId: string;
  cta: string;
  signoffs: Signoff[];
  documentId: string;
  currentUserId?: string;
}

export function DiscussionSignoff({
  discussionId,
  cta,
  signoffs,
  documentId,
  currentUserId,
}: DiscussionSignoffProps) {
  const queryClient = useQueryClient();

  // Fetch document members to compute required signers
  const { data: membersData } = useQuery({
    queryKey: ['members', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/members`);
      if (!res.ok) throw new Error('Failed to fetch members');
      return res.json() as Promise<{ data: MemberRecord[] }>;
    },
  });

  const { data: docData } = useQuery({
    queryKey: ['document', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}`);
      if (!res.ok) throw new Error('Failed to fetch document');
      return res.json() as Promise<{ data: { creator: { id: string; name: string } } }>;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/discussions/${discussionId}/signoff`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || 'Failed to sign off');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Signed off on discussion');
      queryClient.invalidateQueries({ queryKey: ['discussion', discussionId] });
      queryClient.invalidateQueries({ queryKey: ['discussions'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Compute required signers: creator + editors + approvers
  const requiredSigners = new Map<string, string>();
  if (docData?.data?.creator) {
    requiredSigners.set(docData.data.creator.id, docData.data.creator.name);
  }
  if (membersData?.data) {
    for (const m of membersData.data) {
      if (m.role === 'editor' || m.role === 'approver') {
        requiredSigners.set(m.userId, m.user.name);
      }
    }
  }

  const signedUserIds = new Set(signoffs.map((s) => s.userId));
  const hasSigned = currentUserId ? signedUserIds.has(currentUserId) : false;
  const isRequiredSigner = currentUserId ? requiredSigners.has(currentUserId) : false;

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span>CTA:</span>
        <Badge variant={cta === 'need_change' ? 'destructive' : 'secondary'}>
          {cta === 'need_change' ? 'Need Change' : 'No Change'}
        </Badge>
      </div>

      <div className="text-xs text-muted-foreground">
        Signoff progress: {signoffs.length} / {requiredSigners.size}
      </div>

      {requiredSigners.size > 0 && (
        <ul className="space-y-1">
          {Array.from(requiredSigners.entries()).map(([userId, name]) => (
            <li key={userId} className="flex items-center gap-2 text-xs">
              <span
                className={
                  signedUserIds.has(userId)
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-muted-foreground'
                }
              >
                {signedUserIds.has(userId) ? '✓' : '○'}
              </span>
              <span>{name}</span>
            </li>
          ))}
        </ul>
      )}

      {isRequiredSigner && !hasSigned && (
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Signing...' : 'Sign Off'}
        </Button>
      )}
    </div>
  );
}
