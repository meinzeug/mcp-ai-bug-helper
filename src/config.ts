import dotenv from 'dotenv';

dotenv.config();

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
