'use client';

import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface UserInfo {
  name: string;
  email?: string;
  avatarUrl?: string | null;
}

interface UserHoverCardProps {
  user: UserInfo;
  children?: React.ReactNode;
  className?: string;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function UserHoverCard({ user, children, className }: UserHoverCardProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const show = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 6, left: rect.left });
      }
      setVisible(true);
    }, 150);
  }, []);

  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(false), 100);
  }, []);

  const keepVisible = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex items-center cursor-default ${className ?? ''}`}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {children ?? user.name}
      </span>
      {visible &&
        createPortal(
          <span
            role="tooltip"
            className="fixed z-[9999] w-64 rounded-lg border border-border bg-popover p-3 shadow-lg animate-fade-in"
            style={{ top: pos.top, left: pos.left }}
            onMouseEnter={keepVisible}
            onMouseLeave={hide}
          >
            <span className="flex items-center gap-3">
              <Avatar size="lg">
                {user.avatarUrl && <AvatarImage src={user.avatarUrl} />}
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-popover-foreground truncate">
                  {user.name}
                </span>
                {user.email && (
                  <span className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </span>
                )}
              </span>
            </span>
          </span>,
          document.body,
        )}
    </>
  );
}
