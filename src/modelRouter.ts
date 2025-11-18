import { MODEL_LIBRARY } from './modelCatalog.js';
import type { AdvisorModelSpec, ScenarioTag, ToolInput } from './types.js';

const TAG_KEYWORDS: Record<Exclude<ScenarioTag, 'general'>, RegExp[]> = {
  frontend: [/(react|next\.js|vue|svelte|hydration|dom|css|browser)/i],
  node: [/(node\.js|express|worker thread|npm|ts-node|nestjs)/i],
  go: [/(golang|g\b|grpc|goroutine|go1\.|protobuf)/i],
  memory: [/(memory leak|oom|latency|performance|profil|heap|cpu)/i],
  ai: [/(llm|prompt|openai|anthropic|embedding|fine[- ]?tune|rag)/i],
  infra: [/(kubernetes|k8s|aws|gcp|terraform|docker|kafka|redis|postgres)/i],
};

const RELIABILITY_WEIGHT: Record<AdvisorModelSpec['reliability'], number> = {
  platinum: 3,
  gold: 2,
  silver: 1,
};

export interface ModelLineup {
  tags: ScenarioTag[];
  free: AdvisorModelSpec[];
  paid: AdvisorModelSpec[];
}

export function buildModelLineup(input: ToolInput): ModelLineup {
  const haystack = [input.question, input.context].filter(Boolean).join('\n');
  const detectedTags = detectTags(haystack);
  const rankedModels = rankModels(detectedTags);
  const free = rankedModels.filter((model) => model.isFree);
  const paid = rankedModels.filter((model) => !model.isFree);
  return { tags: detectedTags, free, paid };
}

function detectTags(text: string): ScenarioTag[] {
  const lowered = text.toLowerCase();
  const tags = new Set<ScenarioTag>();
  Object.entries(TAG_KEYWORDS).forEach(([tag, regexList]) => {
    if (regexList.some((regex) => regex.test(lowered))) {
      tags.add(tag as ScenarioTag);
    }
  });
  if (tags.size === 0) {
    tags.add('general');
  } else {
    tags.add('general');
  }
  return Array.from(tags);
}

function rankModels(tags: ScenarioTag[]): AdvisorModelSpec[] {
  return [...MODEL_LIBRARY].sort((a, b) => scoreModel(b, tags) - scoreModel(a, tags));
}

function scoreModel(model: AdvisorModelSpec, tags: ScenarioTag[]): number {
  const matchScore = tags.reduce((acc, tag) => acc + (model.strengths.includes(tag) ? 4 : 0), 0);
  const reliability = RELIABILITY_WEIGHT[model.reliability] ?? 1;
  const freeBonus = model.isFree ? 1 : 0;
  return matchScore + reliability + freeBonus;
}
