import 'dotenv/config';
import { formatBacktestSummary, runBacktest } from './backtest-core.js';

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) throw new Error(`Missing env: ${key}`);
  return value;
}

function parseBooleanFlag(name: string): boolean {
  return process.argv.includes(name);
}

function parseIntFlag(prefix: string, fallback: number): number {
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return fallback;
  const parsed = Number.parseInt(arg.slice(prefix.length), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid flag ${prefix}: ${arg}`);
  }
  return parsed;
}

function parseLookaheadDays(): number[] {
  const arg = process.argv.find((value) => value.startsWith('--lookahead='));
  if (!arg) return [1, 3, 5];
  const parsed = arg
    .slice('--lookahead='.length)
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (parsed.length === 0) throw new Error('Invalid --lookahead flag');
  return [...new Set(parsed)].sort((a, b) => a - b);
}

async function main() {
  const report = await runBacktest({
    apifyToken: env('APIFY_TOKEN'),
    llmConfig: {
      baseUrl: env('LLM_BASE_URL', 'https://api.deepinfra.com/v1/openai'),
      apiKey: env('LLM_API_KEY'),
      model: env('LLM_MODEL', 'MiniMaxAI/MiniMax-M2.5'),
    },
    days: parseIntFlag('--days=', 365),
    maxPosts: parseIntFlag('--max-posts=', 300),
    lookaheadDays: parseLookaheadDays(),
    fbOnly: parseBooleanFlag('--fb-only'),
    threadsOnly: parseBooleanFlag('--threads-only'),
  });

  console.log('');
  console.log(formatBacktestSummary(report));
}

main().catch((error) => {
  console.error('[Backtest] 執行失敗:', error instanceof Error ? error.message : error);
  process.exit(1);
});
