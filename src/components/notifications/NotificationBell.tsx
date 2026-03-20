'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { NotificationList } from './NotificationList';
import { useI18n } from '@/i18n/context';

export function NotificationBell() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?unread=true&pageSize=1');
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ pagination: { total: number } }>;
    },
    refetchInterval: 60000,
  });

  const unreadCount = data?.pagination?.total ?? 0;

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      // Focus trap: Tab within the panel
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);

    // Focus the first focusable element in the panel
    requestAnimationFrame(() => {
      const firstButton = panelRef.current?.querySelector<HTMLElement>('button');
      firstButton?.focus();
    });

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, close]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-md p-2 hover:bg-accent transition-colors"
        aria-label={unreadCount > 0 ? t('notifications.titleWithCount', { count: unreadCount }) : t('notifications.title')}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-primary-foreground" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t('notifications.title')}
          className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-popover shadow-lg z-50 animate-scale-in"
        >
          <div className="border-b px-4 py-2">
            <h3 className="text-sm font-medium">{t('notifications.title')}</h3>
          </div>
          <NotificationList
            onNavigate={(docId) => {
              close();
              router.push(`/documents/${docId}`);
            }}
          />
        </div>
      )}
    </div>
  );
}
