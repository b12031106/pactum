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

type AIProvider = 'anthropic' | 'openai';

function detectProvider(): { provider: AIProvider; apiKey: string } | null {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) return { provider: 'anthropic', apiKey: anthropicKey };

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) return { provider: 'openai', apiKey: openaiKey };

  return null;
}

function buildPrompt(input: SummarizeInput): string {
  const commentsText = input.comments
    .map((c, i) => `[${i + 1}] ${c.authorName}: ${c.content}`)
    .join('\n');

  return `You are summarizing a document review discussion for a git commit record.

Document: "${input.documentTitle}"
Resolution: ${input.cta === 'no_change' ? 'No changes needed' : 'Changes needed'}

Discussion thread:
${commentsText}

Write a concise summary (2-4 sentences) of the discussion and its conclusion in the same language as the discussion. Focus on: what was discussed, key points raised, and the final decision. Do not use markdown formatting.`;
}

async function callAnthropic(apiKey: string, prompt: string): Promise<string> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === 'text');
  return textBlock?.text ?? '';
}

async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.choices[0]?.message?.content ?? '';
}

function fallbackSummary(input: SummarizeInput): string {
  const commentSummary = input.comments
    .map((c) => c.content)
    .join(' ')
    .slice(0, 500);
  return `CTA: ${input.cta}. Summary: ${commentSummary}`;
}

/**
 * Summarize a discussion thread using AI.
 * Auto-detects provider: ANTHROPIC_API_KEY → Claude, OPENAI_API_KEY → OpenAI.
 * Falls back to simple concatenation if no API key is configured.
 */
export async function summarizeDiscussion(input: SummarizeInput): Promise<string> {
  const config = detectProvider();

  if (!config) {
    return fallbackSummary(input);
  }

  try {
    const prompt = buildPrompt(input);

    if (config.provider === 'anthropic') {
      return await callAnthropic(config.apiKey, prompt);
    }

    return await callOpenAI(config.apiKey, prompt);
  } catch (error) {
    console.error(`AI summary failed (${config.provider}), using fallback:`, error);
    return fallbackSummary(input);
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

  const shortResolution =
    resolution.length > remaining
      ? resolution.slice(0, remaining - 3) + '...'
      : resolution;

  return `${prefix}${shortResolution}`;
}
