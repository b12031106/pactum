'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';

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
}

export function MemberManager({ documentId, isCreator }: MemberManagerProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState<string | null>(null);

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
      <h3 className="text-sm font-semibold">Members</h3>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : grouped.length === 0 ? (
        <p className="text-xs text-muted-foreground">No members yet.</p>
      ) : (
        <ul className="space-y-2">
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
                  <button
                    type="button"
                    className="ml-1 text-xs text-destructive hover:underline disabled:opacity-50"
                    onClick={() => removeMutation.mutate(g.user.id)}
                    disabled={removeMutation.isPending}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isCreator && (
        <form onSubmit={handleAdd} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="rounded-md border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="editor">Editor</option>
              <option value="advisor">Advisor</option>
              <option value="approver">Approver</option>
            </select>
            <button
              type="submit"
              disabled={addMutation.isPending || !email.trim()}
              className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>
      )}
    </div>
  );
}
