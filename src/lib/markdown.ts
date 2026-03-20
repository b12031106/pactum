/**
 * Pure server-side Tiptap JSON to Markdown converter.
 * No DOM or editor instance required — walks the JSON tree directly.
 */

interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: TiptapMark[];
  content?: TiptapNode[];
  text?: string;
}

function renderMarks(text: string, marks?: TiptapMark[]): string {
  if (!marks?.length) return text;

  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `**${result}**`;
        break;
      case 'italic':
        result = `*${result}*`;
        break;
      case 'strike':
        result = `~~${result}~~`;
        break;
      case 'code':
        result = `\`${result}\``;
        break;
      case 'link':
        result = `[${result}](${mark.attrs?.href ?? ''})`;
        break;
    }
  }
  return result;
}

function renderInlineContent(nodes?: TiptapNode[]): string {
  if (!nodes?.length) return '';
  return nodes.map((node) => {
    if (node.type === 'text') {
      return renderMarks(node.text ?? '', node.marks);
    }
    if (node.type === 'image') {
      const alt = (node.attrs?.alt as string) ?? '';
      const src = (node.attrs?.src as string) ?? '';
      return `![${alt}](${src})`;
    }
    if (node.type === 'hardBreak') {
      return '  \n';
    }
    return '';
  }).join('');
}

function renderNode(node: TiptapNode, indent = ''): string {
  switch (node.type) {
    case 'doc':
      return renderChildren(node.content);

    case 'paragraph':
      return renderInlineContent(node.content);

    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1;
      const prefix = '#'.repeat(level);
      return `${prefix} ${renderInlineContent(node.content)}`;
    }

    case 'bulletList':
      return (node.content ?? [])
        .map((item) => renderListItem(item, '- ', indent))
        .join('\n');

    case 'orderedList': {
      const start = (node.attrs?.start as number) ?? 1;
      return (node.content ?? [])
        .map((item, i) => renderListItem(item, `${start + i}. `, indent))
        .join('\n');
    }

    case 'listItem':
      return renderChildren(node.content, indent);

    case 'blockquote':
      return (node.content ?? [])
        .map((child) => `> ${renderNode(child)}`)
        .join('\n');

    case 'codeBlock': {
      const lang = (node.attrs?.language as string) ?? '';
      const code = renderInlineContent(node.content);
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case 'horizontalRule':
      return '---';

    case 'image': {
      const alt = (node.attrs?.alt as string) ?? '';
      const src = (node.attrs?.src as string) ?? '';
      return `![${alt}](${src})`;
    }

    case 'table':
      return renderTable(node);

    default:
      // Fallback: render inline content if present
      return renderInlineContent(node.content);
  }
}

function renderListItem(item: TiptapNode, prefix: string, indent: string): string {
  const children = item.content ?? [];
  const parts: string[] = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (i === 0) {
      parts.push(`${indent}${prefix}${renderNode(child, indent + '  ')}`);
    } else {
      // Nested lists or subsequent paragraphs
      parts.push(renderNode(child, indent + '  '));
    }
  }

  return parts.join('\n');
}

function renderTable(node: TiptapNode): string {
  const rows = node.content ?? [];
  if (!rows.length) return '';

  const rendered = rows.map((row) =>
    (row.content ?? []).map((cell) => renderInlineContent(cell.content?.[0]?.content))
  );

  const lines: string[] = [];
  for (let i = 0; i < rendered.length; i++) {
    lines.push(`| ${rendered[i].join(' | ')} |`);
    if (i === 0) {
      lines.push(`| ${rendered[i].map(() => '---').join(' | ')} |`);
    }
  }
  return lines.join('\n');
}

function renderChildren(nodes?: TiptapNode[], indent = ''): string {
  if (!nodes?.length) return '';
  return nodes.map((node) => renderNode(node, indent)).join('\n\n');
}

/**
 * Convert Tiptap JSON (or plain string) to Markdown.
 */
export function tiptapJsonToMarkdown(content: unknown): string {
  // String content: return as-is (migration from textarea)
  if (typeof content === 'string') {
    return content;
  }

  // Empty or missing content
  if (!content || typeof content !== 'object') {
    return '';
  }

  const doc = content as TiptapNode;

  // Empty doc
  if (!doc.content?.length) {
    return '';
  }

  return renderNode(doc);
}
