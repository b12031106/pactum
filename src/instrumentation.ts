export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getDocsGitService } = await import('@/lib/git');
    const git = getDocsGitService();
    try {
      await git.cloneOrInit(process.env.DOCS_REPO_REMOTE || undefined);
      console.log('[Pactum] Docs repo initialized');
    } catch (err) {
      console.error('[Pactum] Failed to initialize docs repo:', err);
      process.exit(1);
    }

    const { prisma } = await import('@/lib/prisma');
    setInterval(async () => {
      try {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const result = await prisma.document.updateMany({
          where: { lockedBy: { not: null }, lockedAt: { lt: tenMinutesAgo } },
          data: { lockedBy: null, lockedAt: null },
        });
        if (result.count > 0) {
          console.log(`[Pactum] Cleaned up ${result.count} expired edit lock(s)`);
        }
      } catch (err) {
        console.error('[Pactum] Lock cleanup error:', err);
      }
    }, 5 * 60 * 1000);

    setInterval(async () => {
      try { await git.retryFailedPushes(); }
      catch (err) { console.error('[Pactum] Push retry error:', err); }
    }, 30 * 1000);
  }
}
