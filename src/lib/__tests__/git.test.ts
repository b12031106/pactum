import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GitService } from '@/lib/git';

describe('GitService', () => {
  let tempDir: string;
  let gitService: GitService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pactum-test-'));
    gitService = new GitService(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('initializes a new git repo', async () => {
    await gitService.init();
    const { existsSync } = await import('fs');
    expect(existsSync(join(tempDir, '.git'))).toBe(true);
  });

  it('commits a file and returns commit SHA', async () => {
    await gitService.init();
    const sha = await gitService.commitFile(
      'test.md',
      '# Hello',
      'docs: create - test',
      { name: 'Test User', email: 'test@example.com' },
    );
    expect(sha).toMatch(/^[0-9a-f]{7,40}$/);
  });

  it('gets log for a specific file', async () => {
    await gitService.init();
    await gitService.commitFile('doc1.md', '# Doc 1', 'docs: create - doc1', { name: 'Alice', email: 'alice@test.com' });
    await gitService.commitFile('doc1.md', '# Doc 1 Updated', 'docs: update - doc1', { name: 'Bob', email: 'bob@test.com' });
    const log = await gitService.getLog('doc1.md');
    expect(log).toHaveLength(2);
    expect(log[0].message).toBe('docs: update - doc1');
    expect(log[1].message).toBe('docs: create - doc1');
  });

  it('gets diff for a specific commit', async () => {
    await gitService.init();
    await gitService.commitFile('doc.md', '# Original', 'docs: create', { name: 'Alice', email: 'alice@test.com' });
    const sha = await gitService.commitFile('doc.md', '# Updated', 'docs: update', { name: 'Alice', email: 'alice@test.com' });
    const diff = await gitService.getDiff(sha, 'doc.md');
    expect(diff).toContain('-# Original');
    expect(diff).toContain('+# Updated');
  });

  it('appends metadata comment to file', async () => {
    await gitService.init();
    await gitService.commitFile('doc.md', '# Content', 'docs: create', { name: 'Alice', email: 'alice@test.com' });
    await gitService.appendMetadataComment('doc.md', 'approved', 'alice@test.com');
    const content = readFileSync(join(tempDir, 'doc.md'), 'utf-8');
    expect(content).toContain('<!-- pactum:approved');
    expect(content).toContain('alice@test.com');
  });

  it('serializes concurrent operations via mutex', async () => {
    await gitService.init();
    const results = await Promise.all([
      gitService.commitFile('a.md', '# A', 'create a', { name: 'A', email: 'a@test.com' }),
      gitService.commitFile('b.md', '# B', 'create b', { name: 'B', email: 'b@test.com' }),
    ]);
    expect(results[0]).toBeTruthy();
    expect(results[1]).toBeTruthy();
    const logA = await gitService.getLog('a.md');
    const logB = await gitService.getLog('b.md');
    expect(logA).toHaveLength(1);
    expect(logB).toHaveLength(1);
  });
});
