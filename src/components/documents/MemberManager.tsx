'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import { SelectNative } from '@/components/ui/select-native';
import { Users } from 'lucide-react';
import { useI18n } from '@/i18n/context';

interface MemberUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface MemberRecord {
  id: string;
  documentId: string;
  userId: string;
  role: string;
  user: MemberUser;
}

interface GroupedMember {
  user: MemberUser;
  roles: string[];
}

interface MemberManagerProps {
  documentId: string;
  isCreator: boolean;
  creator?: MemberUser;
}

export function MemberManager({ documentId, isCreator, creator }: MemberManagerProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<GroupedMember | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['members', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/members`);
      if (!res.ok) throw new Error('Failed to fetch members');
      return res.json() as Promise<{ data: MemberRecord[] }>;
    },
  });

  const addMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      const res = await fetch(`/api/documents/${documentId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || 'Failed to add member');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', documentId] });
      setEmail('');
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/documents/${documentId}/members/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body?.error?.message || 'Failed to remove member');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', documentId] });
      setRemoveTarget(null);
    },
  });

  const members = data?.data ?? [];

  // Group by user
  const grouped: GroupedMember[] = [];
  const userMap = new Map<string, GroupedMember>();
  for (const m of members) {
    const existing = userMap.get(m.userId);
    if (existing) {
      existing.roles.push(m.role);
    } else {
      const entry: GroupedMember = { user: m.user, roles: [m.role] };
      userMap.set(m.userId, entry);
      grouped.push(entry);
    }
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    addMutation.mutate({ email: email.trim(), role });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">{t('members.title')}</h3>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t('members.loading')}</p>
      ) : (
        <ul className="space-y-2">
          {creator && (
            <li className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{creator.name}</div>
                <div className="truncate text-xs text-muted-foreground">{creator.email}</div>
              </div>
              <Badge variant="secondary">creator</Badge>
            </li>
          )}
          {grouped.map((g) => (
            <li key={g.user.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{g.user.name}</div>
                <div className="truncate text-xs text-muted-foreground">{g.user.email}</div>
              </div>
              <div className="flex items-center gap-1">
                {g.roles.map((r) => (
                  <Badge key={r} variant="secondary">
                    {r}
                  </Badge>
                ))}
                {isCreator && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="ml-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setRemoveTarget(g)}
                    disabled={removeMutation.isPending}
                  >
                    {t('members.remove')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isCreator && (
        <form onSubmit={handleAdd} className="space-y-2">
          <div className="flex gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('members.emailPlaceholder')}
              className="flex-1 h-8"
            />
            <SelectNative
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="editor">Editor</option>
              <option value="advisor">Advisor</option>
              <option value="approver">Approver</option>
            </SelectNative>
            <Button type="submit" size="sm" disabled={addMutation.isPending || !email.trim()}>
              {t('members.add')}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>
      )}

      {/* Remove confirmation dialog */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('members.removeTitle')}</DialogTitle>
            <DialogDescription>
              {t('members.removeDesc', { name: removeTarget?.user.name || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              {t('actions.cancel')}
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => removeTarget && removeMutation.mutate(removeTarget.user.id)}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? t('members.removing') : t('members.remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
