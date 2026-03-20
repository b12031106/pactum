'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/context';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const handleSignIn = () => {
    setLoading(true);
    signIn('google', { callbackUrl: '/documents' });
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center relative">
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-sm flex-col items-center gap-10 px-4">
        <div className="text-center space-y-3">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-xl font-bold">
            P
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Pactum</h1>
          <p className="text-muted-foreground text-balance leading-relaxed">
            {t('app.description')}
          </p>
        </div>

        <div className="w-full space-y-4">
          <Button
            size="lg"
            className="w-full h-11"
            onClick={handleSignIn}
            disabled={loading}
          >
            {loading ? t('auth.signingIn') : t('auth.signInGoogle')}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {t('auth.signInHint')}
          </p>
        </div>
      </div>
    </div>
  );
}
