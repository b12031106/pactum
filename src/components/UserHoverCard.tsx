'use client';

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
  return (
    <span className={`relative inline-flex items-center group/user ${className ?? ''}`}>
      <span className="cursor-default">{children ?? user.name}</span>
      <span
        role="tooltip"
        className="invisible opacity-0 group-hover/user:visible group-hover/user:opacity-100 transition-all duration-150 absolute left-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-border bg-popover p-3 shadow-lg"
      >
        <span className="flex items-center gap-3">
          <Avatar size="lg">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} />}
            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-popover-foreground truncate">{user.name}</span>
            {user.email && (
              <span className="text-xs text-muted-foreground truncate">{user.email}</span>
            )}
          </span>
        </span>
      </span>
    </span>
  );
}
