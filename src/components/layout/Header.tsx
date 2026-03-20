'use client';

import { signOut, useSession } from 'next-auth/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';

export function Header() {
  const { data: session } = useSession();
  if (!session?.user) return null;
  const initials = session.user.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  return (
    <header className="border-b">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/documents" className="text-lg font-bold">Pactum</Link>
        <DropdownMenu>
          <DropdownMenuTrigger className="relative h-8 w-8 rounded-full focus:outline-none">
            <Avatar className="h-8 w-8">
              <AvatarImage src={session.user.image || undefined} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="flex items-center gap-2 p-2">
              <div className="text-sm font-medium">{session.user.name}</div>
            </div>
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/login' })}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
