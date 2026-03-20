'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DocumentList } from '@/components/documents/DocumentList';
import { useI18n } from '@/i18n/context';

export default function DocumentsPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('documents.title')}</h1>
        <Button nativeButton={false} render={<Link href="/documents/new" />}>{t('documents.new')}</Button>
      </div>
      <DocumentList />
    </div>
  );
}
