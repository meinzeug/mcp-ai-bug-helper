export interface ToolInput {
  question: string;
  context?: string;
}

export interface AdvisorModelSpec {
  id: string;
  label: string;
  focus: string;
  isFree: boolean;
}

export interface AdvisorCallResult {
  modelId: string;
  modelLabel: string;
  focus: string;
  isFree: boolean;
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
