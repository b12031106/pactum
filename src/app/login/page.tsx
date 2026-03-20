'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Pactum</h1>
          <p className="mt-2 text-muted-foreground">Git-based document collaboration</p>
        </div>
        <Button size="lg" className="w-full" onClick={() => signIn('google', { callbackUrl: '/documents' })}>
          Sign in with Google
        </Button>
      </div>
    </div>
  );
}
