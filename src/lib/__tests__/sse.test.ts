import { describe, it, expect } from 'vitest';

describe('SSE Registry', () => {
  it('should be importable', async () => {
    const mod = await import('@/lib/sse');
    expect(mod.pushToSSE).toBeDefined();
    expect(mod.registerSSEConnection).toBeDefined();
    expect(mod.removeSSEConnection).toBeDefined();
  });
});
