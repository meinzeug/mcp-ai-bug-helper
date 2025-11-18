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
  private modelCache?: { ids: Set<string>; fetchedAt: number };
  private readonly modelCacheTtlMs = 5 * 60 * 1000;

  constructor(
    private readonly apiKey: string,
    private readonly metadata: { referer: string; appName: string }
  ) {
    if (!apiKey) {
      throw new Error('Missing OpenRouter API key.');
    }
  }

  async chat(model: string, opts: ChatOptions): Promise<ChatResult> {
    const systemPrompt = [
      'You are a veteran debugging partner for complex production systems.',
      'Goals:',
      '1. Identify the most probable root cause using the provided details.',
      '2. Propose concrete code-level fixes or experiments (assume editor + shell access).',
      '3. Explain trade-offs, risks, and validation steps.',
      '4. Suggest log/telemetry probes when evidence is missing.',
      'Return Markdown with sections: Summary, Root Cause, Fix Plan, Validation, Follow-ups.',
      'Use concise bullets, but include code snippets or shell commands where they unblock the investigation.',
    ].join(' ');

    const userLines = [`### Primary bug\n${opts.question.trim()}`];

    if (opts.context) {
      userLines.push('\n### Additional context\n' + opts.context.trim());
    }

    userLines.push(
      '\n### Output expectations\n- Emphasise reproducible steps and failing assumptions.\n- Include at least one validation or logging idea.\n- Mention relevant docs/packages if they help.'
    );

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

  async ensureModelAvailable(modelId: string): Promise<boolean> {
    const cache = await this.getModelList();
    return cache.has(modelId);
  }

  private async getModelList(): Promise<Set<string>> {
    const now = Date.now();
    if (this.modelCache && now - this.modelCache.fetchedAt < this.modelCacheTtlMs) {
      return this.modelCache.ids;
    }

    const response = await fetch(`${this.baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': this.metadata.referer,
        'X-Title': this.metadata.appName,
      },
    });

    if (!response.ok) {
      throw new OpenRouterError(`Failed to list OpenRouter models (${response.status})`, response.status);
    }

    const payload = (await response.json()) as { data?: { id: string }[] };
    const ids = new Set<string>((payload.data ?? []).map((entry) => entry.id));
    this.modelCache = { ids, fetchedAt: now };
    return ids;
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
