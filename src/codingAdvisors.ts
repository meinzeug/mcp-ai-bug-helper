import { FREE_CODING_MODELS, PAID_FALLBACK_MODELS } from './modelCatalog.js';
import { OpenRouterClient } from './openrouterClient.js';
import type { ToolInput, AdvisorBatchResult, AdvisorModelSpec, AdvisorCallResult } from './types.js';
import { RateLimitError } from './errors.js';

export class CodingAdvisorCoordinator {
  private fallbackPointer = 0;

  constructor(private readonly client: OpenRouterClient) {}

  async advise(input: ToolInput): Promise<AdvisorBatchResult> {
    const answers: AdvisorCallResult[] = [];
    let fallbackTriggered = false;
    let fallbackMode = false;

    for (const spec of FREE_CODING_MODELS) {
      if (!fallbackMode) {
        try {
          const answer = await this.queryModel(spec, input, false);
          answers.push(answer);
          continue;
        } catch (error) {
          if (error instanceof RateLimitError) {
            fallbackMode = true;
            fallbackTriggered = true;
          } else {
            throw error;
          }
        }
      }

      const fallbackAnswer = await this.queryNextFallback(input);
      answers.push(fallbackAnswer);
    }

    return { answers, fallbackTriggered };
  }

  private async queryModel(
    spec: AdvisorModelSpec,
    input: ToolInput,
    usedFallback: boolean
  ): Promise<AdvisorCallResult> {
    const startedAt = Date.now();
    const chatPayload =
      typeof input.context === 'string' && input.context.length > 0
        ? { question: input.question, context: input.context }
        : { question: input.question };

    const chat = await this.client.chat(spec.id, chatPayload);

    const result: AdvisorCallResult = {
      modelId: spec.id,
      modelLabel: spec.label,
      focus: spec.focus,
      isFree: spec.isFree,
      usedFallback,
      responseText: chat.text?.trim() || '(empty response)',
      latencyMs: Date.now() - startedAt,
    };

    if (chat.usage) {
      result.usage = chat.usage;
    }

    return result;
  }

  private async queryNextFallback(input: ToolInput): Promise<AdvisorCallResult> {
    const maxAttempts = PAID_FALLBACK_MODELS.length;
    if (maxAttempts === 0) {
      throw new RateLimitError('No fallback models configured.');
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const spec = PAID_FALLBACK_MODELS[(this.fallbackPointer + attempt) % maxAttempts];
      if (!spec) {
        continue;
      }
      try {
        const answer = await this.queryModel(spec, input, true);
        this.fallbackPointer = (this.fallbackPointer + attempt + 1) % maxAttempts;
        return answer;
      } catch (error) {
        if (error instanceof RateLimitError) {
          continue;
        }
        throw error;
      }
    }

    throw new RateLimitError('Every fallback model is currently rate limited.');
  }
}
