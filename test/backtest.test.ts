import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBacktestSummary, scoreTrade, summarizeTrades, type BacktestTrade } from '../src/backtest-core.ts';

test('scoreTrade handles long, short, and flat outcomes', () => {
  assert.equal(scoreTrade(5, 'long'), 'win');
  assert.equal(scoreTrade(-2, 'long'), 'loss');
  assert.equal(scoreTrade(-3, 'short'), 'win');
  assert.equal(scoreTrade(4, 'short'), 'loss');
  assert.equal(scoreTrade(0, 'short'), 'flat');
});

test('summarizeTrades aggregates win rate and average return by horizon', () => {
  const trades: BacktestTrade[] = [
    {
      postId: '1',
      postTimestamp: '2026-04-01T00:00:00.000Z',
      source: 'threads',
      url: 'https://example.com/1',
      targetName: '台積電',
      targetType: '個股',
      herAction: '買入',
      reverseView: '可能下跌',
      confidence: '高',
      signalDirection: 'short',
      matchedSymbol: '2330',
      matchedName: '台積電',
      entryDate: '2026-04-02',
      entryClose: 100,
      results: [
        { lookaheadDays: 1, exitDate: '2026-04-03', exitClose: 95, returnPct: -5, outcome: 'win' },
        { lookaheadDays: 3, exitDate: '2026-04-07', exitClose: 105, returnPct: 5, outcome: 'loss' },
      ],
    },
    {
      postId: '2',
      postTimestamp: '2026-04-02T00:00:00.000Z',
      source: 'facebook',
      url: 'https://example.com/2',
      targetName: '聯發科',
      targetType: '個股',
      herAction: '停損賣出',
      reverseView: '可能反彈',
      confidence: '中',
      signalDirection: 'long',
      matchedSymbol: '2454',
      matchedName: '聯發科',
      entryDate: '2026-04-03',
      entryClose: 200,
      results: [
        { lookaheadDays: 1, exitDate: '2026-04-06', exitClose: 210, returnPct: 5, outcome: 'win' },
        { lookaheadDays: 3, exitDate: '2026-04-08', exitClose: 200, returnPct: 0, outcome: 'flat' },
      ],
    },
  ];

  assert.deepEqual(summarizeTrades(trades, [1, 3]), [
    {
      lookaheadDays: 1,
      wins: 2,
      losses: 0,
      flats: 0,
      winRate: 100,
      averageReturnPct: 0,
    },
    {
      lookaheadDays: 3,
      wins: 0,
      losses: 1,
      flats: 1,
      winRate: 0,
      averageReturnPct: 2.5,
    },
  ]);
});

test('formatBacktestSummary renders readable output', () => {
  const text = formatBacktestSummary({
    generatedAt: '2026-04-10T00:00:00.000Z',
    windowDays: 365,
    fetchedPosts: 50,
    analyzedPosts: 10,
    skippedNonInvestmentPosts: 35,
    skippedUnresolvedTargets: 3,
    skippedInsufficientPriceData: 2,
    lookaheadDays: [1, 3, 5],
    summary: [
      {
        lookaheadDays: 1,
        wins: 3,
        losses: 2,
        flats: 1,
        winRate: 60,
        averageReturnPct: -1.23,
      },
    ],
    trades: [],
  });

  assert.match(text, /巴逆逆反指標回測/);
  assert.match(text, /過去 365 天/);
  assert.match(text, /1 天：3 勝 \/ 2 負 \/ 1 平，勝率 60.0%/);
  assert.match(text, /非投資貼文 35/);
});
