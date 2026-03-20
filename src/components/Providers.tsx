'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryProvider } from '@/lib/query-client';
import { useSSE } from '@/hooks/useSSE';
import { I18nProvider } from '@/i18n/context';

function SSEProvider({ children }: { children: React.ReactNode }) {
  useSSE();
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryProvider>
        <I18nProvider>
          <SSEProvider>{children}</SSEProvider>
        </I18nProvider>
      </QueryProvider>
    </SessionProvider>
  );
}
