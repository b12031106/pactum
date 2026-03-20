import { describe, it, expect } from 'vitest';
import { tiptapJsonToMarkdown } from '@/lib/markdown';

describe('tiptapJsonToMarkdown', () => {
  it('converts heading to markdown', () => {
    const json = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hello' }] },
      ],
    };
    const md = tiptapJsonToMarkdown(json);
    expect(md.trim()).toBe('# Hello');
  });

  it('converts paragraph with bold text', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', marks: [{ type: 'bold' }], text: 'world' },
        ],
      }],
    };
    const md = tiptapJsonToMarkdown(json);
    expect(md.trim()).toBe('Hello **world**');
  });

  it('converts bullet list', () => {
    const json = {
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] }] },
        ],
      }],
    };
    const md = tiptapJsonToMarkdown(json);
    expect(md).toContain('Item 1');
    expect(md).toContain('Item 2');
  });

  it('handles empty document', () => {
    const json = { type: 'doc', content: [] };
    const md = tiptapJsonToMarkdown(json);
    expect(md.trim()).toBe('');
  });

  it('converts string content (migration from textarea)', () => {
    const md = tiptapJsonToMarkdown('# Plain text content');
    expect(md).toContain('# Plain text content');
  });
});
