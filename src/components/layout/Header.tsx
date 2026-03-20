'use client';

import { signOut, useSession } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { NotificationBell } from '@/components/notifications/NotificationBell';

function getInitialDark() {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem('theme');
  const prefersDark = stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', prefersDark);
  return prefersDark;
}

export function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [dark, setDark] = useState(getInitialDark);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  if (!session?.user) return null;
  const initials = session.user.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <header className="border-b">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-14 items-center justify-between">
        <Link href="/documents" className="text-lg font-bold">Pactum</Link>
        <nav className="flex items-center gap-2" aria-label="Main navigation">
          <Link
            href="/settings"
            className={`hidden sm:inline-block text-sm transition-colors ${
              pathname === '/settings'
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Settings
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-md p-2 hover:bg-accent transition-colors"
            aria-label="Toggle theme"
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger className="relative h-8 w-8 rounded-full focus:outline-none">
              <Avatar className="h-8 w-8">
                <AvatarImage src={session.user.image || undefined} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="flex flex-col gap-0.5 p-2">
                <div className="text-sm font-medium">{session.user.name}</div>
                <div className="text-xs text-muted-foreground">{session.user.email}</div>
              </div>
              <DropdownMenuItem className="sm:hidden" onClick={() => router.push('/settings')}>Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/login' })}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
}
