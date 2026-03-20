'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TagSelector } from '@/components/documents/TagSelector';
import { useI18n } from '@/i18n/context';

export default function NewDocumentPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError(t('newDoc.titleRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), tags: tags.length > 0 ? tags : undefined }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message || 'Failed to create document');
      }

      const { data } = await res.json();
      router.push(`/documents/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">{t('newDoc.title')}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">{t('newDoc.titleLabel')}</Label>
          <Input
            id="title"
            placeholder={t('newDoc.titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label>{t('newDoc.tags')}</Label>
          <TagSelector tags={tags} onChange={setTags} />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? t('newDoc.creating') : t('newDoc.create')}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t('actions.cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
