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
  private freeDisabled = false;

  constructor(private readonly client: OpenRouterClient) {}

  async advise(input: ToolInput): Promise<AdvisorBatchResult> {
    const answers: AdvisorCallResult[] = [];
    const lineup = buildModelLineup(input);
    let fallbackTriggered = false;

    const freePool = this.freeDisabled ? [] : lineup.free;

    for (const spec of freePool) {
      if (answers.length >= 3) break;
      const outcome = await this.tryModel(spec, lineup.tags, input, false);
      if (outcome?.type === 'rate-limit') {
        fallbackTriggered = true;
        break;
      }
      if (outcome?.result) {
        answers.push(outcome.result);
      }
      if (this.freeDisabled) {
        break;
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
        if (spec.isFree) {
          this.disableFreeModels('rate limit reached');
        }
        this.cooldownModel(spec.id, 90 * 1000);
        return { type: 'rate-limit' };
      }

      if (error instanceof OpenRouterError) {
        if (spec.isFree) {
          this.disableFreeModels(`provider error (${error.status ?? 'unknown'})`);
        }
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
      console.warn(
        `Failed to verify OpenRouter availability for ${modelId}. Assuming it is reachable.`,
        error
      );
      return true;
    }
  }

  private isCoolingDown(modelId: string): boolean {
    const until = this.cooldowns.get(modelId);
    return typeof until === 'number' && until > Date.now();
  }

  private cooldownModel(modelId: string, durationMs: number): void {
    this.cooldowns.set(modelId, Date.now() + durationMs);
  }

  private disableFreeModels(reason: string): void {
    if (this.freeDisabled) {
      return;
    }
    this.freeDisabled = true;
    console.warn(
      `[coding-advisors] Free OpenRouter advisors disabled (${reason}). Switching to paid models only until process restart.`
    );
  }
}

function deriveScenarioTag(tags: ScenarioTag[], spec: AdvisorModelSpec): ScenarioTag {
  const match = tags.find((tag) => spec.strengths.includes(tag));
  return match ?? 'general';
}
