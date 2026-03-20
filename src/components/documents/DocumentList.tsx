'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { DocumentCard } from './DocumentCard';
import type { DocumentStatus } from '@/types';

interface DocumentItem {
  id: string;
  title: string;
  status: DocumentStatus;
  tags: { tag: string }[];
  creator: { name: string };
  updatedAt: string;
}

const statusOptions: { value: string; label: string }[] = [
  { value: '', label: 'All Status' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
];

export function DocumentList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['documents', search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/documents?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch documents');
      return res.json() as Promise<{ data: DocumentItem[]; pagination: unknown }>;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading...</p>}
      {error && <p className="text-destructive">Failed to load documents.</p>}

      {data && data.data.length === 0 && (
        <p className="text-muted-foreground">No documents found.</p>
      )}

      {data && data.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((doc) => (
            <DocumentCard
              key={doc.id}
              id={doc.id}
              title={doc.title}
              status={doc.status}
              tags={doc.tags}
              creator={doc.creator}
              updatedAt={doc.updatedAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
