#!/usr/bin/env node
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = ((chunk: any, encoding?: any, callback?: any) => {
  const text = typeof chunk === 'string' ? chunk : chunk?.toString?.() ?? '';
  if (text.startsWith('[dotenv@')) {
    if (typeof callback === 'function') callback();
    return true;
  }
  process.stdout.write = originalWrite;
  return originalWrite(chunk, encoding, callback);
}) as typeof process.stdout.write;
process.env.DOTENV_CONFIG_QUIET ??= 'true';
process.env.DOTENV_LOG ??= '0';
await import('./server.js');
