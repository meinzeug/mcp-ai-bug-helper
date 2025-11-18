export interface ToolInput {
  question: string;
  context?: string;
}

export type ScenarioTag =
  | 'frontend'
  | 'node'
  | 'go'
  | 'memory'
  | 'ai'
  | 'infra'
  | 'general';

export interface AdvisorModelSpec {
  id: string;
  label: string;
  focus: string;
  isFree: boolean;
  vendor: string;
  maxContextTokens?: number;
  reliability: 'platinum' | 'gold' | 'silver';
  strengths: ScenarioTag[];
}

export interface AdvisorCallResult {
  modelId: string;
  modelLabel: string;
  focus: string;
  isFree: boolean;
  scenarioTag: ScenarioTag;
  usedFallback: boolean;
  responseText: string;
  latencyMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AdvisorBatchResult {
  answers: AdvisorCallResult[];
  fallbackTriggered: boolean;
}
