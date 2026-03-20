import 'server-only';

interface DiscussionComment {
  authorName: string;
  content: string;
}

interface SummarizeInput {
  documentTitle: string;
  cta: 'no_change' | 'need_change';
  comments: DiscussionComment[];
}

/**
 * Summarize a discussion thread using Claude API.
 * Returns a structured summary with conclusion.
 * Falls back to simple concatenation if API key is not configured.
 */
export async function summarizeDiscussion(input: SummarizeInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // Fallback: simple concatenation when API key not configured
    const commentSummary = input.comments
      .map((c) => c.content)
      .join(' ')
      .slice(0, 500);
    return `CTA: ${input.cta}. Summary: ${commentSummary}`;
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const commentsText = input.comments
      .map((c, i) => `[${i + 1}] ${c.authorName}: ${c.content}`)
      .join('\n');

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `You are summarizing a document review discussion for a git commit record.

Document: "${input.documentTitle}"
Resolution: ${input.cta === 'no_change' ? 'No changes needed' : 'Changes needed'}

Discussion thread:
${commentsText}

Write a concise summary (2-4 sentences) of the discussion and its conclusion in the same language as the discussion. Focus on: what was discussed, key points raised, and the final decision. Do not use markdown formatting.`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    return textBlock?.text ?? `CTA: ${input.cta}`;
  } catch (error) {
    console.error('AI summary failed, using fallback:', error);
    const commentSummary = input.comments
      .map((c) => c.content)
      .join(' ')
      .slice(0, 500);
    return `CTA: ${input.cta}. Summary: ${commentSummary}`;
  }
}

/**
 * Generate a short (max 80 chars) summary for git commit subject line.
 */
export async function generateCommitSummary(
  documentTitle: string,
  resolution: string,
): Promise<string> {
  const maxLen = 80;
  const prefix = `docs: resolve discussion - ${documentTitle} / `;
  const remaining = maxLen - prefix.length;

  if (remaining <= 10) {
    return `docs: resolve discussion - ${documentTitle}`.slice(0, maxLen);
  }

  // Truncate resolution to fit
  const shortResolution =
    resolution.length > remaining
      ? resolution.slice(0, remaining - 3) + '...'
      : resolution;

  return `${prefix}${shortResolution}`;
}
