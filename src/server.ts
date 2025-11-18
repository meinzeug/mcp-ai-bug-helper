#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import pkg from '../package.json' with { type: 'json' };
import { config, assertConfig } from './config.js';
import { OpenRouterClient } from './openrouterClient.js';
import { CodingAdvisorCoordinator } from './codingAdvisors.js';
import type { ToolInput, AdvisorBatchResult } from './types.js';
import { RateLimitError, OpenRouterError } from './errors.js';

assertConfig();

const client = new OpenRouterClient(config.apiKey, {
  appName: config.appName,
  referer: config.referer,
});

const coordinator = new CodingAdvisorCoordinator(client);

const server = new McpServer(
  {
    name: 'coding-advisor-mcp',
    version: typeof pkg.version === 'string' ? pkg.version : '0.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
    instructions:
      'Use the ask-coding-advisors tool whenever you want three independent coding-specialist LLM takes via OpenRouter (free first, paid fallback after rate limits). Provide the bug or question plus any context.',
  }
);

const inputSchema = z.object({
  question: z
    .string()
    .min(4, 'Bitte fasse dein Problem in mindestens vier Zeichen zusammen.')
    .max(4000, 'Question too long (4k char cap).'),
  context: z.string().max(12000).optional(),
});

server.registerTool(
  'ask-coding-advisors',
  {
    title: 'Ask Coding Advisors',
    description:
      'Queries three OpenRouter coding specialists (free tier) and falls back to premium models when rate limited.',
    inputSchema,
  },
  async (args) => {
    const input: ToolInput = typeof args.context === 'string' && args.context.length > 0
      ? { question: args.question, context: args.context }
      : { question: args.question };

    try {
      const batch = await coordinator.advise(input);
      const formatted = formatBatch(batch);
      return {
        content: [
          {
            type: 'text',
            text: formatted,
          },
        ],
      };
    } catch (error) {
      const prefix = 'Coding advisor tool failed';
      const message =
        error instanceof Error ? `${prefix}: ${error.message}` : `${prefix}: ${String(error)}`;

      const isRetryable = error instanceof RateLimitError || error instanceof OpenRouterError;

      return {
        isError: isRetryable,
        content: [
          {
            type: 'text',
            text: message,
          },
        ],
      };
    }
  }
);

const transport = new StdioServerTransport();
server
  .connect(transport)
  .catch((error) => {
    console.error('Failed to start MCP server', error);
    process.exit(1);
  });

function formatBatch(batch: AdvisorBatchResult): string {
  const header = batch.fallbackTriggered
    ? '⚠️ OpenRouter rate limit hit — switched to paid fallbacks for the remaining slots.\n'
    : '';

  const body = batch.answers
    .map((answer, index) => {
      const tier = answer.isFree ? 'free tier' : answer.usedFallback ? 'paid fallback' : 'paid';
      const latency = formatLatency(answer.latencyMs);
      const usageBits = formatUsage(answer.usage);

      return [
        `Advisor ${index + 1}: ${answer.modelLabel} (${tier})`,
        `Focus: ${answer.focus}`,
        `Latency: ${latency}${usageBits ? ` | Usage: ${usageBits}` : ''}`,
        '',
        answer.responseText,
      ].join('\n');
    })
    .join('\n\n---\n\n');

  return header + body;
}

function formatLatency(ms: number): string {
  if (!Number.isFinite(ms)) {
    return 'n/a';
  }
  if (ms < 1000) {
    return `${ms.toFixed(0)} ms`;
  }
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatUsage(usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }) {
  if (!usage) return '';
  const parts: string[] = [];
  if (Number.isFinite(usage.promptTokens)) {
    parts.push(`prompt ${usage.promptTokens}`);
  }
  if (Number.isFinite(usage.completionTokens)) {
    parts.push(`completion ${usage.completionTokens}`);
  }
  if (Number.isFinite(usage.totalTokens)) {
    parts.push(`total ${usage.totalTokens}`);
  }
  return parts.join(', ');
}
