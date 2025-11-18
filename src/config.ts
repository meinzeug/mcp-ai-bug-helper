import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function loadFromDotEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const contents = readFileSync(envPath, 'utf8');
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const [key, ...rest] = line.split('=');
    if (!key || rest.length === 0) continue;
    const value = rest.join('=').trim();
    if (!process.env[key.trim()]) {
      process.env[key.trim()] = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    }
  }
}

if (!process.env.OPENROUTER_API_KEY) {
  try {
    loadFromDotEnv();
  } catch (error) {
    console.warn('Failed to read .env file for OpenRouter credentials', error);
  }
}

const APP_NAME = process.env.OPENROUTER_APP_NAME ?? 'MCP AI Bug Helper';
const REFERER = process.env.OPENROUTER_REFERRER ?? 'https://github.com/meinzeug/mcp-ai-bug-helper';

export const config = {
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  referer: REFERER,
  appName: APP_NAME,
};

export function assertConfig() {
  if (!config.apiKey) {
    throw new Error('Missing OPENROUTER_API_KEY. Add it to your environment or .env file.');
  }
}
