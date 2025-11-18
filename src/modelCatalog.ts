import type { AdvisorModelSpec } from './types.js';

export const FREE_CODING_MODELS: AdvisorModelSpec[] = [
  {
    id: 'qwen/qwen3-coder:free',
    label: 'Qwen 3 Coder (free tier)',
    focus: 'Large multilingual coding specialist tuned for debugging and refactoring.',
    isFree: true,
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct:free',
    label: 'Qwen 2.5 Coder 32B Instruct (free tier)',
    focus: 'Precision-focused programming assistant optimized for step-by-step reasoning.',
    isFree: true,
  },
  {
    id: 'agentica-org/deepcoder-14b-preview:free',
    label: 'Agentica DeepCoder 14B Preview (free tier)',
    focus: 'Lean reasoning-first code generation preview tuned for bug triage.',
    isFree: true,
  },
];

export const PAID_FALLBACK_MODELS: AdvisorModelSpec[] = [
  {
    id: 'anthropic/claude-3.7-sonnet',
    label: 'Claude 3.7 Sonnet',
    focus: 'Anthropic flagship coding-capable model for premium fallbacks.',
    isFree: false,
  },
  {
    id: 'mistralai/codestral-2508',
    label: 'Codestral 25.08',
    focus: 'Mistral’s production-grade code generation model.',
    isFree: false,
  },
];
