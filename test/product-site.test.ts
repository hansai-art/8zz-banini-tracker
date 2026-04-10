import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildProductSite } from '../src/product-site.ts';

function withTempDirs(fn: (dirs: { rootDir: string; dataDir: string; siteDir: string }) => void): void {
  const rootDir = mkdtempSync(join(tmpdir(), 'banini-product-site-'));
  const dataDir = join(rootDir, 'data');
  const siteDir = join(rootDir, 'site');
  mkdirSync(dataDir, { recursive: true });
  try {
    fn({ rootDir, dataDir, siteDir });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
}

test('buildProductSite generates structured catalog, target pages, and sitemap', () => {
  withTempDirs(({ dataDir, siteDir }) => {
    writeFileSync(
      join(dataDir, 'report-2026-04-10T000000.json'),
      JSON.stringify(
        {
          timestamp: '2026-04-10T00:00:00.000Z',
          posts: [
            {
              id: 'threads-1',
              source: 'threads',
              text: '台積電又不行了，我先停損。',
              ocrText: '',
              timestamp: '2026-04-10T00:00:00.000Z',
              url: 'https://example.com/post',
            },
          ],
          analysis: {
            hasInvestmentContent: true,
            summary: '台積電停損後可能反彈。',
            moodScore: 7,
            chainAnalysis: '停損後市場賣壓可能告一段落。',
            actionableSuggestion: '先觀察是否站回短線均線。',
            mentionedTargets: [
              {
                name: '台積電',
                type: '個股',
                herAction: '停損賣出',
                reverseView: '可能反彈',
                confidence: '高',
                reasoning: '停損通常代表情緒極端。',
              },
            ],
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    writeFileSync(
      join(dataDir, 'backtest-2026-04-10T000000.json'),
      JSON.stringify(
        {
          generatedAt: '2026-04-10T00:00:00.000Z',
          windowDays: 365,
          fetchedPosts: 10,
          analyzedPosts: 4,
          skippedNonInvestmentPosts: 5,
          skippedUnresolvedTargets: 1,
          skippedInsufficientPriceData: 0,
          lookaheadDays: [1, 3],
          summary: [],
          trades: [
            {
              postId: 'threads-1',
              postTimestamp: '2026-04-10T00:00:00.000Z',
              source: 'threads',
              url: 'https://example.com/post',
              targetName: '台積電',
              targetType: '個股',
              herAction: '停損賣出',
              reverseView: '可能反彈',
              confidence: '高',
              signalDirection: 'long',
              matchedSymbol: '2330',
              matchedName: '台積電',
              entryDate: '2026-04-11',
              entryClose: 1000,
              results: [
                { lookaheadDays: 1, exitDate: '2026-04-12', exitClose: 1020, returnPct: 2, outcome: 'win' },
                { lookaheadDays: 3, exitDate: '2026-04-14', exitClose: 980, returnPct: -2, outcome: 'loss' },
              ],
            },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    );

    const siteData = buildProductSite(dataDir, siteDir);
    const targetSlug = encodeURIComponent('台積電');
    const signalId = siteData.latestSignals[0]?.id;

    assert.equal(siteData.summary.signalBatches, 1);
    assert.equal(siteData.summary.investableSignals, 1);
    assert.equal(siteData.summary.trackedTargets, 1);
    assert.equal(siteData.summary.trades, 1);
    assert.equal(siteData.signalFilters.find((filter) => filter.slug === 'high-confidence')?.count, 1);
    assert.equal(siteData.signalFilters.find((filter) => filter.slug === 'long')?.count, 1);
    assert.equal(siteData.signalFilters.find((filter) => filter.slug === 'facebook')?.count, 0);
    assert.equal(siteData.targets[0]?.name, '台積電');
    assert.equal(siteData.targets[0]?.backtest.tradeCount, 1);

    assert.equal(existsSync(join(siteDir, 'data', 'catalog.json')), true);
    assert.equal(existsSync(join(siteDir, 'data', 'signals.json')), true);
    assert.equal(existsSync(join(siteDir, 'data', 'signal-filters.json')), true);
    assert.equal(existsSync(join(siteDir, 'signals', 'index.html')), true);
    assert.equal(existsSync(join(siteDir, 'signals', 'high-confidence.html')), true);
    assert.equal(existsSync(join(siteDir, 'signals', `${signalId}.html`)), true);
    assert.equal(existsSync(join(siteDir, 'targets', `${targetSlug}.html`)), true);
    assert.equal(existsSync(join(siteDir, 'sitemap.xml')), true);

    const catalog = readFileSync(join(siteDir, 'data', 'catalog.json'), 'utf-8');
    assert.match(catalog, /台積電/);
    assert.match(catalog, /停損賣出/);

    const homePage = readFileSync(join(siteDir, 'index.html'), 'utf-8');
    assert.match(homePage, /訊號中心/);
    assert.match(homePage, /台積電停損後可能反彈/);
    assert.match(homePage, /快速篩選入口/);
    assert.match(homePage, /high-confidence\.html/);
    assert.match(homePage, /signals\/index\.html/);

    const signalsIndex = readFileSync(join(siteDir, 'signals', 'index.html'), 'utf-8');
    assert.match(signalsIndex, /訊號 Archive/);
    assert.match(signalsIndex, /常用篩選/);
    assert.match(signalsIndex, /查看完整訊號頁/);

    const highConfidencePage = readFileSync(join(siteDir, 'signals', 'high-confidence.html'), 'utf-8');
    assert.match(highConfidencePage, /高信心訊號/);
    assert.match(highConfidencePage, /符合條件訊號/);
    assert.match(highConfidencePage, /signal-/);

    const signalDetailPage = readFileSync(join(siteDir, 'signals', `${signalId}.html`), 'utf-8');
    assert.match(signalDetailPage, /可行動建議/);
    assert.match(signalDetailPage, /原文預覽/);
    assert.match(signalDetailPage, /站回短線均線/);

    const targetPage = readFileSync(join(siteDir, 'targets', `${targetSlug}.html`), 'utf-8');
    assert.match(targetPage, /回測摘要/);
    assert.match(targetPage, /停損賣出/);
    assert.match(targetPage, new RegExp(`/signals/${signalId}\\.html`));

    const sitemap = readFileSync(join(siteDir, 'sitemap.xml'), 'utf-8');
    assert.equal(sitemap.includes('/signals/high-confidence.html'), true);
    assert.equal(sitemap.includes(`/signals/${signalId}.html`), true);
    assert.equal(sitemap.includes(`/targets/${targetSlug}.html`), true);
  });
});

test('buildProductSite still emits placeholder pages without archived data', () => {
  withTempDirs(({ dataDir, siteDir }) => {
    const siteData = buildProductSite(dataDir, siteDir);

    assert.equal(siteData.summary.signalBatches, 0);
    assert.equal(siteData.summary.trackedTargets, 0);
    assert.equal(siteData.signalFilters.find((filter) => filter.slug === 'high-confidence')?.count, 0);

    const homePage = readFileSync(join(siteDir, 'index.html'), 'utf-8');
    assert.match(homePage, /尚未產生任何 report-\*\.json 檔案/);
    assert.equal(existsSync(join(siteDir, 'robots.txt')), true);
    assert.equal(existsSync(join(siteDir, 'faq', 'index.html')), true);
    assert.equal(existsSync(join(siteDir, 'signals', 'index.html')), true);
    assert.equal(existsSync(join(siteDir, 'signals', 'high-confidence.html')), true);
  });
});

test('buildProductSite removes stale generated signal and target pages', () => {
  withTempDirs(({ dataDir, siteDir }) => {
    mkdirSync(join(siteDir, 'signals'), { recursive: true });
    mkdirSync(join(siteDir, 'targets'), { recursive: true });
    writeFileSync(join(siteDir, 'signals', 'old-signal.html'), 'stale', 'utf-8');
    writeFileSync(join(siteDir, 'targets', 'old-target.html'), 'stale', 'utf-8');

    buildProductSite(dataDir, siteDir);

    assert.equal(existsSync(join(siteDir, 'signals', 'old-signal.html')), false);
    assert.equal(existsSync(join(siteDir, 'targets', 'old-target.html')), false);
  });
});
