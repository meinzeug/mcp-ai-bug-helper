import type { AdvisorModelSpec } from './types.js';

export const FREE_CODING_MODELS: AdvisorModelSpec[] = [
  {
    id: 'kwaipilot/kat-coder-pro:free',
    label: 'Kat Coder Pro (free tier)',
    focus: 'Chinese coding-specialist tuned for debugging suggestions and refactors.',
    isFree: true,
  },
  {
    id: 'openrouter/sherlock-dash-alpha',
    label: 'Sherlock Dash Alpha',
    focus: 'Fast diagnostics-focused model optimised for code troubleshooting.',
    isFree: true,
  },
  {
    id: 'openrouter/sherlock-think-alpha',
    label: 'Sherlock Think Alpha',
    focus: 'Deliberative debugging agent that produces longer reasoning chains.',
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
