'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['user-settings'],
    queryFn: async () => {
      const res = await fetch('/api/users/me');
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json() as Promise<{ data: UserSettings }>;
    },
  });

  const [prefs, setPrefs] = useState({ inApp: true, email: true, slack: false });
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    if (data?.data) {
      setPrefs(data.data.notificationPrefs);
      setWebhookUrl(data.data.slackWebhookUrl ?? '');
    }
  }, [data]);

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
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Notification Preferences</h2>

        <Checkbox
          checked={prefs.inApp}
          onChange={(v) => setPrefs({ ...prefs, inApp: v })}
          label="In-app notifications"
        />
        <Checkbox
          checked={prefs.email}
          onChange={(v) => setPrefs({ ...prefs, email: v })}
          label="Email notifications"
        />
        <Checkbox
          checked={prefs.slack}
          onChange={(v) => setPrefs({ ...prefs, slack: v })}
          label="Slack notifications"
        />

        {prefs.slack && (
          <div className="space-y-2 animate-fade-in">
            <Label htmlFor="slack-webhook">Slack Webhook URL</Label>
            <Input
              id="slack-webhook"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
            />
          </div>
        )}
      </div>

      <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving...' : 'Save Settings'}
      </Button>
    </div>
  );
}
