import { OpenRouterClient } from './openrouterClient.js';
import { buildModelLineup } from './modelRouter.js';
import type {
  ToolInput,
  AdvisorBatchResult,
  AdvisorModelSpec,
  AdvisorCallResult,
  ScenarioTag,
} from './types.js';
import { RateLimitError, OpenRouterError } from './errors.js';

export class CodingAdvisorCoordinator {
  private readonly cooldowns = new Map<string, number>();

  constructor(private readonly client: OpenRouterClient) {}

  async advise(input: ToolInput): Promise<AdvisorBatchResult> {
    const answers: AdvisorCallResult[] = [];
    const lineup = buildModelLineup(input);
    let fallbackTriggered = false;

    for (const spec of lineup.free) {
      if (answers.length >= 3) break;
      const outcome = await this.tryModel(spec, lineup.tags, input, false);
      if (outcome?.type === 'rate-limit') {
        fallbackTriggered = true;
        break;
      }
      if (outcome?.result) {
        answers.push(outcome.result);
      }
    }

    if (answers.length < 3) {
      fallbackTriggered = true;
      for (const spec of lineup.paid) {
        if (answers.length >= 3) break;
        const outcome = await this.tryModel(spec, lineup.tags, input, true);
        if (outcome?.result) {
          answers.push(outcome.result);
        }
      }
    }

    if (answers.length < 3) {
      throw new Error('Keine gesunden OpenRouter-Modelle verfügbar – bitte später erneut versuchen.');
    }

    return { answers, fallbackTriggered };
  }

  private async tryModel(
    spec: AdvisorModelSpec,
    scenarioTags: ScenarioTag[],
    input: ToolInput,
    usedFallback: boolean
  ): Promise<{ result?: AdvisorCallResult; type: 'ok' | 'rate-limit' } | null> {
    if (this.isCoolingDown(spec.id)) {
      return null;
    }

    const available = await this.safeEnsureAvailability(spec.id);
    if (!available) {
      this.cooldownModel(spec.id, 10 * 60 * 1000);
      return null;
    }

    const startedAt = Date.now();
    const chatPayload =
      typeof input.context === 'string' && input.context.length > 0
        ? { question: input.question, context: input.context }
        : { question: input.question };

    try {
      const chat = await this.client.chat(spec.id, chatPayload);
      const result: AdvisorCallResult = {
        modelId: spec.id,
        modelLabel: spec.label,
        focus: spec.focus,
        isFree: spec.isFree,
        scenarioTag: deriveScenarioTag(scenarioTags, spec),
        usedFallback,
        responseText: chat.text?.trim() || '(empty response)',
        latencyMs: Date.now() - startedAt,
      };

      if (chat.usage) {
        result.usage = chat.usage;
      }

      return { result, type: 'ok' };
    } catch (error) {
      if (error instanceof RateLimitError) {
        this.cooldownModel(spec.id, 90 * 1000);
        return { type: 'rate-limit' };
      }

      if (error instanceof OpenRouterError) {
        this.cooldownModel(spec.id, 5 * 60 * 1000);
        return null;
      }

      throw error;
    }
  }

  private async safeEnsureAvailability(modelId: string): Promise<boolean> {
    try {
      return await this.client.ensureModelAvailable(modelId);
    } catch (error) {
      console.warn(`Failed to check availability for ${modelId}`, error);
      return false;
    }
  }

  private isCoolingDown(modelId: string): boolean {
    const until = this.cooldowns.get(modelId);
    return typeof until === 'number' && until > Date.now();
  }

  private cooldownModel(modelId: string, durationMs: number): void {
    this.cooldowns.set(modelId, Date.now() + durationMs);
  }
}

function deriveScenarioTag(tags: ScenarioTag[], spec: AdvisorModelSpec): ScenarioTag {
  const match = tags.find((tag) => spec.strengths.includes(tag));
  return match ?? 'general';
}
