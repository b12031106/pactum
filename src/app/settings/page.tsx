'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectNative } from '@/components/ui/select-native';
import { useI18n } from '@/i18n/context';
import { LOCALES } from '@/i18n/index';
import type { Locale } from '@/i18n/index';

interface UserSettings {
  id: string;
  name: string;
  email: string;
  notificationPrefs: { inApp: boolean; email: boolean; slack: boolean };
  slackWebhookUrl: string | null;
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <span className="relative flex h-5 w-5 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-5 w-5 rounded border border-input transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50" />
        <svg className="absolute h-3 w-3 text-primary-foreground opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6l2.5 2.5 4.5-4.5" /></svg>
      </span>
      <span className="text-sm">{label}</span>
    </label>
  );
}

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['user-settings'],
    queryFn: async () => {
      const res = await fetch('/api/users/me');
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json() as Promise<{ data: UserSettings }>;
    },
  });

  const [initializedId, setInitializedId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState({ inApp: true, email: true, slack: false });
  const [webhookUrl, setWebhookUrl] = useState('');

  if (data?.data && initializedId !== data.data.id) {
    setInitializedId(data.data.id);
    setPrefs(data.data.notificationPrefs);
    setWebhookUrl(data.data.slackWebhookUrl ?? '');
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationPrefs: prefs,
          slackWebhookUrl: webhookUrl || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
    },
    onError: () => toast.error('Failed to save settings'),
  });

  if (isLoading) return (
    <div className="max-w-lg space-y-6">
      <div className="h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-5 w-36 animate-pulse rounded bg-muted" />
        <div className="h-5 w-36 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('settings.language')}</h2>
        <SelectNative value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
          {LOCALES.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </SelectNative>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">{t('settings.notifications')}</h2>

        <Checkbox
          checked={prefs.inApp}
          onChange={(v) => setPrefs({ ...prefs, inApp: v })}
          label={t('settings.inApp')}
        />
        <Checkbox
          checked={prefs.email}
          onChange={(v) => setPrefs({ ...prefs, email: v })}
          label={t('settings.email')}
        />
        <Checkbox
          checked={prefs.slack}
          onChange={(v) => setPrefs({ ...prefs, slack: v })}
          label={t('settings.slack')}
        />

        {prefs.slack && (
          <div className="space-y-2 animate-fade-in">
            <Label htmlFor="slack-webhook">{t('settings.slackWebhook')}</Label>
            <Input
              id="slack-webhook"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder={t('settings.slackPlaceholder')}
            />
          </div>
        )}
      </div>

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? t('settings.saving') : t('settings.save')}
      </Button>
    </div>
  );
}
