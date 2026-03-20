'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { DocumentCardSkeleton } from '@/components/ui/LoadingSkeleton';
import { DocumentCard } from './DocumentCard';
import { useDebouncedValue } from '@/hooks/useDebounce';
import { SelectNative } from '@/components/ui/select-native';
import { FileText } from 'lucide-react';
import { useI18n } from '@/i18n/context';
import type { DocumentStatus } from '@/types';

interface DocumentItem {
  id: string;
  title: string;
  status: DocumentStatus;
  tags: { tag: string }[];
  creator: { name: string; email?: string; avatarUrl?: string | null };
  updatedAt: string;
}

export function DocumentList() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const statusOptions = useMemo(() => [
    { value: '', label: t('documents.allStatus') },
    { value: 'draft', label: t('status.draft') },
    { value: 'in_review', label: t('status.inReview') },
    { value: 'approved', label: t('status.approved') },
  ], [t]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['documents', debouncedSearch, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/documents?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch documents');
      return res.json() as Promise<{ data: DocumentItem[]; pagination: unknown }>;
    },
    staleTime: 15_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input
          placeholder={t('documents.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <SelectNative
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </SelectNative>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <DocumentCardSkeleton key={i} />
          ))}
        </div>
      )}
      {error && <p className="text-destructive">{t('documents.loadFailed')}</p>}

      {data && data.data.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <FileText className="size-8 text-muted-foreground" />
          </div>
          <p className="text-lg font-medium">{t('documents.noDocuments')}</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            {t('documents.noDocumentsDesc')}
          </p>
        </div>
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
