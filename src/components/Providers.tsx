'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryProvider } from '@/lib/query-client';
import { useSSE } from '@/hooks/useSSE';

function SSEProvider({ children }: { children: React.ReactNode }) {
  useSSE();
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryProvider>
        <SSEProvider>{children}</SSEProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
