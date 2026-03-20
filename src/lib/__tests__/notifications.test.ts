import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    notification: { create: vi.fn() },
    documentMember: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

describe('Notification types', () => {
  it('should export sendNotification function', async () => {
    const mod = await import('@/lib/notifications');
    expect(mod.sendNotification).toBeDefined();
    expect(typeof mod.sendNotification).toBe('function');
  });
});
