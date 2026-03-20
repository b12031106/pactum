'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock } from 'lucide-react';

interface SignoffUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface SignoffEntry {
  user: SignoffUser;
  signed: boolean;
  signedAt: string | null;
}

interface SignoffData {
  progress: SignoffEntry[];
  total: number;
  signed: number;
  allSigned: boolean;
}

interface SignoffProgressProps {
  documentId: string;
}

export function SignoffProgress({ documentId }: SignoffProgressProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['signoffs', documentId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/signoffs`);
      if (!res.ok) throw new Error('Failed to fetch signoff progress');
      return res.json() as Promise<{ data: SignoffData }>;
    },
  });

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">Loading signoff progress...</p>;
  }

  const signoffData = data?.data;
  if (!signoffData) return null;

  return (
    <div className="rounded-md border p-4 space-y-3">
      <h3 className="text-sm font-semibold">
        Signoff Progress: {signoffData.signed} / {signoffData.total} signed
      </h3>
      <ul className="space-y-2">
        {signoffData.progress.map((entry) => (
          <li key={entry.user.id} className="flex items-center gap-2 text-sm">
            {entry.signed ? (
              <CheckCircle2 className="size-4 text-green-600 shrink-0" />
            ) : (
              <Clock className="size-4 text-muted-foreground shrink-0" />
            )}
            <span className={entry.signed ? 'text-foreground' : 'text-muted-foreground'}>
              {entry.user.name}
            </span>
            {entry.signed && entry.signedAt && (
              <span className="text-xs text-muted-foreground ml-auto">
                {new Date(entry.signedAt).toLocaleString()}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
