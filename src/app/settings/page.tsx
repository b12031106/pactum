'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface UserSettings {
  id: string;
  name: string;
  email: string;
  notificationPrefs: { inApp: boolean; email: boolean; slack: boolean };
  slackWebhookUrl: string | null;
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

  if (isLoading) return <p className="text-muted-foreground">Loading settings...</p>;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Notification Preferences</h2>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={prefs.inApp}
            onChange={(e) => setPrefs({ ...prefs, inApp: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-sm">In-app notifications</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={prefs.email}
            onChange={(e) => setPrefs({ ...prefs, email: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-sm">Email notifications</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={prefs.slack}
            onChange={(e) => setPrefs({ ...prefs, slack: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-sm">Slack notifications</span>
        </label>

        {prefs.slack && (
          <div className="space-y-1">
            <label htmlFor="slack-webhook" className="text-sm font-medium">
              Slack Webhook URL
            </label>
            <input
              id="slack-webhook"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
