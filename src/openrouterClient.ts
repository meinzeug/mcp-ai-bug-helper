import { RateLimitError, OpenRouterError } from './errors.js';

export interface ChatOptions {
  question: string;
  context?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
}

export class OpenRouterClient {
  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  constructor(
    private readonly apiKey: string,
    private readonly metadata: { referer: string; appName: string }
  ) {
    if (!apiKey) {
      throw new Error('Missing OpenRouter API key.');
    }
  }

  async chat(model: string, opts: ChatOptions): Promise<ChatResult> {
    const systemPrompt =
      'You are a meticulous senior software engineer who explains code reasoning, debugging steps, and trade-offs with actionable detail.';

    const userLines = [
      `Question: ${opts.question.trim()}`,
    ];

    if (opts.context) {
      userLines.push('\nAdditional context:\n' + opts.context.trim());
    }

    userLines.push('\nWhen relevant, propose next debugging actions or references.');

    const payload = {
      model,
      temperature: opts.temperature ?? 0.15,
      max_output_tokens: opts.maxTokens ?? 900,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userLines.join('\n') },
      ],
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': this.metadata.referer,
        'X-Title': this.metadata.appName,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const errorPayload = await safeJson(response);
      throw new RateLimitError(
        formatErrorMessage(errorPayload) ?? 'OpenRouter rate limit reached.',
        Number.isFinite(retryAfter) ? retryAfter : undefined
      );
    }

    if (!response.ok) {
      const errorPayload = await safeJson(response);
      throw new OpenRouterError(
        formatErrorMessage(errorPayload) ?? `OpenRouter error ${response.status}`,
        response.status
      );
    }

    const data = (await response.json()) as any;
    const content = data?.choices?.[0]?.message?.content;
    const text = extractText(content);

    return {
      text,
      usage: {
        promptTokens: data?.usage?.prompt_tokens,
        completionTokens: data?.usage?.completion_tokens,
        totalTokens: data?.usage?.total_tokens,
      },
      raw: data,
    };
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    try {
      return await response.clone().text();
    } catch {
      return undefined;
    }
  }
}

function formatErrorMessage(payload: unknown): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload === 'object' && 'error' in payload) {
    const errorValue = (payload as any).error;
    if (typeof errorValue === 'string') {
      return errorValue;
    }
    if (errorValue && typeof errorValue === 'object') {
      return errorValue.message ?? JSON.stringify(errorValue);
    }
  }

  return undefined;
}

function extractText(
  content: unknown
): string {
  if (!content) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((chunk) => {
        if (!chunk || typeof chunk !== 'object') return '';
        if ('text' in chunk && typeof (chunk as any).text === 'string') {
          return (chunk as any).text;
        }
        if ('content' in chunk && typeof (chunk as any).content === 'string') {
          return (chunk as any).content;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof content === 'object' && 'text' in (content as any)) {
    return String((content as any).text ?? '');
  }

  return '';
}
