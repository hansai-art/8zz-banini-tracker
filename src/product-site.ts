import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { BaniniAnalysis } from './analyze.js';
import type { BacktestReport } from './backtest-core.js';

type SourceType = 'threads' | 'facebook';
type SignalDirection = 'long' | 'short' | 'neutral';
const MAX_POST_PREVIEW_LENGTH = 120;
const SITE_ORIGIN = process.env.SITE_ORIGIN ?? 'https://example.com';

export interface ArchivedPostRecord {
  id?: string;
  source: SourceType;
  text: string;
  ocrText?: string;
  timestamp: string;
  url: string;
}

export interface ReportArchiveRecord {
  timestamp: string;
  posts: ArchivedPostRecord[];
  analysis: BaniniAnalysis;
}

export interface SignalMentionRecord {
  slug: string;
  name: string;
  type: string;
  herAction: string;
  reverseView: string;
  confidence: string;
  confidenceScore: number;
  reasoning: string;
  direction: SignalDirection;
}

export interface SignalBatchRecord {
  id: string;
  generatedAt: string;
  summary: string;
  hasInvestmentContent: boolean;
  moodScore: number | null;
  chainAnalysis: string;
  actionableSuggestion: string;
  sourceBreakdown: Record<SourceType, number>;
  posts: Array<{
    id: string;
    source: SourceType;
    timestamp: string;
    url: string;
    preview: string;
  }>;
  mentions: SignalMentionRecord[];
}

export interface TargetBacktestStats {
  lookaheadDays: number;
  wins: number;
  losses: number;
  flats: number;
  winRate: number;
  averageReturnPct: number;
}

export interface TargetPageRecord {
  slug: string;
  name: string;
  type: string;
  signalCount: number;
  highConfidenceCount: number;
  latestSignalAt: string;
  actions: string[];
  directions: SignalDirection[];
  recentMentions: Array<SignalMentionRecord & { generatedAt: string; summary: string; signalId: string }>;
  backtest: {
    tradeCount: number;
    byLookahead: TargetBacktestStats[];
  };
}

export interface ProductSiteData {
  generatedAt: string;
  summary: {
    signalBatches: number;
    investableSignals: number;
    trackedTargets: number;
    backtests: number;
    trades: number;
  };
  latestSignals: SignalBatchRecord[];
  targets: TargetPageRecord[];
  scoreboard: {
    overall: TargetBacktestStats[];
    topTargets: Array<{
      slug: string;
      name: string;
      tradeCount: number;
      winRate: number;
      averageReturnPct: number;
    }>;
    actions: Array<{
      action: string;
      tradeCount: number;
      winRate: number;
      averageReturnPct: number;
    }>;
  };
}

interface AggregatedTarget {
  slug: string;
  name: string;
  type: string;
  signalCount: number;
  highConfidenceCount: number;
  latestSignalAt: string;
  actions: Set<string>;
  directions: Set<SignalDirection>;
  recentMentions: Array<SignalMentionRecord & { generatedAt: string; summary: string; signalId: string }>;
  backtestByLookahead: Map<number, { wins: number; losses: number; flats: number; returns: number[] }>;
  tradeCount: number;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function shorten(text: string, maxLength: number): string {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return '（無文字，可能是圖片貼文）';
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function confidenceToScore(confidence: string): number {
  if (confidence.includes('高')) return 3;
  if (confidence.includes('中')) return 2;
  if (confidence.includes('低')) return 1;
  return 0;
}

function inferDirection(reverseView: string): SignalDirection {
  if (/(上漲|反彈|續漲|走高|偏多|看多|做多|噴|漲)/.test(reverseView)) return 'long';
  if (/(下跌|續跌|走低|偏空|看空|做空|回檔|跌)/.test(reverseView)) return 'short';
  return 'neutral';
}

function buildSignalId(timestamp: string, index: number): string {
  const normalizedTimestamp = timestamp.replace(/[^0-9A-Za-z]+/g, '-').replace(/^-+|-+$/g, '');
  return `signal-${normalizedTimestamp || 'unknown'}-${index}`;
}

function buildTargetSlug(name: string): string {
  return encodeURIComponent(normalizeWhitespace(name).replace(/\s+/g, '-'));
}

function safeReadJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function listJsonFiles(dir: string, prefix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .sort()
    .map((name) => join(dir, name));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/<\/script>/gi, '<\\/script>');
}

function renderLayout(
  title: string,
  description: string,
  content: string,
  options?: { canonicalPath?: string; jsonLd?: Record<string, unknown> | Record<string, unknown>[] },
): string {
  const canonical = options?.canonicalPath ? `${SITE_ORIGIN}${options.canonicalPath}` : null;
  let jsonLdItems: Record<string, unknown>[] = [];
  if (options?.jsonLd) {
    jsonLdItems = Array.isArray(options.jsonLd) ? options.jsonLd : [options.jsonLd];
  }
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  ${canonical ? `<link rel="canonical" href="${canonical}">` : ''}
  <style>
    :root {
      color-scheme: light dark;
      --bg: #0b1120;
      --surface: #111827;
      --card: #172033;
      --text: #e5e7eb;
      --muted: #9ca3af;
      --accent: #38bdf8;
      --border: #24324a;
      --good: #34d399;
      --bad: #fb7185;
      --flat: #fbbf24;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    header, main, footer { width: min(1120px, calc(100% - 32px)); margin: 0 auto; }
    header { padding: 40px 0 24px; }
    nav { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 12px; }
    main { padding-bottom: 64px; }
    .hero, .card { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 24px; margin-bottom: 24px; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-top: 20px; }
    .metric, .mini-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
    .metric strong { display: block; font-size: 1.8rem; }
    .muted { color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    ul { padding-left: 20px; }
    .tag { display: inline-block; border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; margin: 4px 8px 0 0; font-size: 0.9rem; color: var(--muted); }
    .good { color: var(--good); }
    .bad { color: var(--bad); }
    .flat { color: var(--flat); }
    .eyebrow { text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); font-size: 0.78rem; font-weight: 700; }
    .signal-list { display: grid; gap: 12px; }
    .signal-item { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
    .footer-note { color: var(--muted); font-size: 0.95rem; padding-bottom: 48px; }
  </style>
  ${jsonLdItems
    .map((item) => `<script type="application/ld+json">${escapeJsonLd(item)}</script>`)
    .join('\n  ')}
</head>
<body>
  <header>
    <div class="eyebrow">8zz Banini Tracker</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="muted">${escapeHtml(description)}</p>
    <nav>
      <a href="/index.html">首頁</a>
      <a href="/signals/index.html">訊號 archive</a>
      <a href="/scoreboard/index.html">命中展示</a>
      <a href="/methodology/index.html">方法論</a>
      <a href="/faq/index.html">FAQ</a>
      <a href="/targets/index.html">標的頁</a>
    </nav>
  </header>
  <main>${content}</main>
  <footer>
    <p class="footer-note">僅供娛樂與研究參考，不構成投資建議。這些頁面由本專案根據既有報告與回測結果自動生成，用來補齊產品化、信任層與 SEO/GEO 載體。</p>
  </footer>
</body>
</html>`;
}

function renderSignalCard(signal: SignalBatchRecord): string {
  return `<article class="signal-item">
    <div class="eyebrow">${escapeHtml(signal.generatedAt)}</div>
    <h3><a href="/signals/${signal.id}.html">${escapeHtml(signal.summary)}</a></h3>
    <p class="muted">來源：Threads ${signal.sourceBreakdown.threads} 篇 / Facebook ${signal.sourceBreakdown.facebook} 篇</p>
    ${signal.mentions.length
      ? `<p>${signal.mentions
          .slice(0, 5)
          .map((mention) => `<span class="tag">${escapeHtml(mention.name)}｜${escapeHtml(mention.reverseView)}｜${escapeHtml(mention.confidence)}</span>`)
          .join('')}</p>`
      : '<p class="muted">這批貼文未形成可投資標的。</p>'}
    <p><a href="/signals/${signal.id}.html">查看完整訊號頁 →</a></p>
  </article>`;
}

function renderLookaheadTable(rows: TargetBacktestStats[]): string {
  if (rows.length === 0) {
    return '<p class="muted">尚無足夠回測資料。</p>';
  }
  return `<table>
    <thead>
      <tr><th>觀察天數</th><th>勝 / 負 / 平</th><th>勝率</th><th>平均報酬</th></tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row) => `<tr>
            <td>${row.lookaheadDays} 天</td>
            <td>${row.wins} / ${row.losses} / ${row.flats}</td>
            <td>${row.winRate.toFixed(1)}%</td>
            <td>${row.averageReturnPct.toFixed(2)}%</td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table>`;
}

function listReportArchives(dataDir: string): ReportArchiveRecord[] {
  return listJsonFiles(dataDir, 'report-')
    .map((path) => safeReadJson<ReportArchiveRecord>(path))
    .filter((record): record is ReportArchiveRecord => Boolean(record))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function listBacktestArchives(dataDir: string): BacktestReport[] {
  return listJsonFiles(dataDir, 'backtest-')
    .map((path) => safeReadJson<BacktestReport>(path))
    .filter((record): record is BacktestReport => Boolean(record))
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

function buildSignalBatches(reportArchives: ReportArchiveRecord[]): SignalBatchRecord[] {
  return reportArchives.map((record, index) => ({
    id: buildSignalId(record.timestamp, index),
    generatedAt: record.timestamp,
    summary: record.analysis.summary,
    hasInvestmentContent: record.analysis.hasInvestmentContent,
    moodScore: record.analysis.moodScore ?? null,
    chainAnalysis: record.analysis.chainAnalysis ?? '',
    actionableSuggestion: record.analysis.actionableSuggestion ?? '',
    sourceBreakdown: {
      threads: record.posts.filter((post) => post.source === 'threads').length,
      facebook: record.posts.filter((post) => post.source === 'facebook').length,
    },
    posts: record.posts.map((post, postIndex) => ({
      id: post.id ?? `post-${index}-${postIndex}`,
      source: post.source,
      timestamp: post.timestamp,
      url: post.url,
      preview: shorten(post.text || post.ocrText || '', MAX_POST_PREVIEW_LENGTH),
    })),
    mentions: (record.analysis.mentionedTargets ?? []).map((target) => ({
      slug: buildTargetSlug(target.name),
      name: target.name,
      type: target.type,
      herAction: target.herAction,
      reverseView: target.reverseView,
      confidence: target.confidence,
      confidenceScore: confidenceToScore(target.confidence),
      reasoning: target.reasoning,
      direction: inferDirection(target.reverseView),
    })),
  }));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeBacktestRows(
  source: Map<number, { wins: number; losses: number; flats: number; returns: number[] }>,
): TargetBacktestStats[] {
  return [...source.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lookaheadDays, stats]) => {
      const decided = stats.wins + stats.losses;
      return {
        lookaheadDays,
        wins: stats.wins,
        losses: stats.losses,
        flats: stats.flats,
        winRate: decided === 0 ? 0 : (stats.wins / decided) * 100,
        averageReturnPct: average(stats.returns),
      };
    });
}

function buildSiteData(reportArchives: ReportArchiveRecord[], backtestArchives: BacktestReport[]): ProductSiteData {
  const latestSignals = buildSignalBatches(reportArchives);
  const targetMap = new Map<string, AggregatedTarget>();
  const overallLookahead = new Map<number, { wins: number; losses: number; flats: number; returns: number[] }>();
  const actionMap = new Map<string, { action: string; tradeCount: number; wins: number; losses: number; returns: number[] }>();
  let tradeCount = 0;

  for (const signal of latestSignals) {
    for (const mention of signal.mentions) {
      const existing = targetMap.get(mention.slug) ?? {
        slug: mention.slug,
        name: mention.name,
        type: mention.type,
        signalCount: 0,
        highConfidenceCount: 0,
        latestSignalAt: signal.generatedAt,
        actions: new Set<string>(),
        directions: new Set<SignalDirection>(),
        recentMentions: [],
        backtestByLookahead: new Map<number, { wins: number; losses: number; flats: number; returns: number[] }>(),
        tradeCount: 0,
      };
      existing.signalCount += 1;
      if (mention.confidenceScore >= 3) existing.highConfidenceCount += 1;
      if (signal.generatedAt > existing.latestSignalAt) existing.latestSignalAt = signal.generatedAt;
      existing.actions.add(mention.herAction);
      existing.directions.add(mention.direction);
      existing.recentMentions.push({
        ...mention,
        generatedAt: signal.generatedAt,
        summary: signal.summary,
        signalId: signal.id,
      });
      existing.recentMentions.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
      existing.recentMentions = existing.recentMentions.slice(0, 8);
      targetMap.set(mention.slug, existing);
    }
  }

  for (const report of backtestArchives) {
    for (const trade of report.trades) {
      tradeCount += 1;
      const slug = buildTargetSlug(trade.targetName);
      const target = targetMap.get(slug) ?? {
        slug,
        name: trade.targetName,
        type: trade.targetType,
        signalCount: 0,
        highConfidenceCount: 0,
        latestSignalAt: trade.postTimestamp,
        actions: new Set<string>(),
        directions: new Set<SignalDirection>(),
        recentMentions: [],
        backtestByLookahead: new Map<number, { wins: number; losses: number; flats: number; returns: number[] }>(),
        tradeCount: 0,
      };
      target.tradeCount += 1;
      target.actions.add(trade.herAction);
      target.directions.add(trade.signalDirection);
      if (trade.postTimestamp > target.latestSignalAt) target.latestSignalAt = trade.postTimestamp;

      for (const result of trade.results) {
        const byTarget = target.backtestByLookahead.get(result.lookaheadDays) ?? {
          wins: 0,
          losses: 0,
          flats: 0,
          returns: [],
        };
        if (result.outcome === 'win') byTarget.wins += 1;
        if (result.outcome === 'loss') byTarget.losses += 1;
        if (result.outcome === 'flat') byTarget.flats += 1;
        byTarget.returns.push(result.returnPct);
        target.backtestByLookahead.set(result.lookaheadDays, byTarget);

        const overall = overallLookahead.get(result.lookaheadDays) ?? {
          wins: 0,
          losses: 0,
          flats: 0,
          returns: [],
        };
        if (result.outcome === 'win') overall.wins += 1;
        if (result.outcome === 'loss') overall.losses += 1;
        if (result.outcome === 'flat') overall.flats += 1;
        overall.returns.push(result.returnPct);
        overallLookahead.set(result.lookaheadDays, overall);

        const action = actionMap.get(trade.herAction) ?? {
          action: trade.herAction,
          tradeCount: 0,
          wins: 0,
          losses: 0,
          returns: [],
        };
        action.tradeCount += 1;
        if (result.outcome === 'win') action.wins += 1;
        if (result.outcome === 'loss') action.losses += 1;
        action.returns.push(result.returnPct);
        actionMap.set(trade.herAction, action);
      }

      targetMap.set(slug, target);
    }
  }

  const targets = [...targetMap.values()]
    .map<TargetPageRecord>((target) => ({
      slug: target.slug,
      name: target.name,
      type: target.type,
      signalCount: target.signalCount,
      highConfidenceCount: target.highConfidenceCount,
      latestSignalAt: target.latestSignalAt,
      actions: [...target.actions].sort(),
      directions: [...target.directions],
      recentMentions: target.recentMentions,
      backtest: {
        tradeCount: target.tradeCount,
        byLookahead: computeBacktestRows(target.backtestByLookahead),
      },
    }))
    .sort((a, b) => {
      const scoreA = a.signalCount * 5 + a.backtest.tradeCount * 3 + a.highConfidenceCount * 2;
      const scoreB = b.signalCount * 5 + b.backtest.tradeCount * 3 + b.highConfidenceCount * 2;
      return scoreB - scoreA || b.latestSignalAt.localeCompare(a.latestSignalAt);
    });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      signalBatches: latestSignals.length,
      investableSignals: latestSignals.reduce((sum, signal) => sum + signal.mentions.length, 0),
      trackedTargets: targets.length,
      backtests: backtestArchives.length,
      trades: tradeCount,
    },
    latestSignals,
    targets,
    scoreboard: {
      overall: computeBacktestRows(overallLookahead),
      topTargets: targets
        .filter((target) => target.backtest.tradeCount > 0)
        .map((target) => {
          const firstRow = target.backtest.byLookahead[0];
          return {
            slug: target.slug,
            name: target.name,
            tradeCount: target.backtest.tradeCount,
            winRate: firstRow?.winRate ?? 0,
            averageReturnPct: firstRow?.averageReturnPct ?? 0,
          };
        })
        .sort((a, b) => b.tradeCount - a.tradeCount || b.winRate - a.winRate)
        .slice(0, 15),
      actions: [...actionMap.values()]
        .map((action) => ({
          action: action.action,
          tradeCount: action.tradeCount,
          winRate: action.wins + action.losses === 0 ? 0 : (action.wins / (action.wins + action.losses)) * 100,
          averageReturnPct: average(action.returns),
        }))
        .sort((a, b) => b.tradeCount - a.tradeCount || b.winRate - a.winRate)
        .slice(0, 12),
    },
  };
}

function renderHomePage(data: ProductSiteData): string {
  const description = '把 8zz 社群貼文、AI 反指標判讀與回測紀錄整理成可驗證的事件驅動投資情報入口。';
  return renderLayout(
    '8zz Banini Tracker｜訊號中心',
    description,
    `<section class="hero">
      <p>這一版先補上產品化底座：把既有報告沉澱成訊號中心、標的頁與命中展示頁，讓免費工具開始長出信任層、學習層與 SEO/GEO 載體。</p>
      <div class="metrics">
        <div class="metric"><span class="muted">訊號批次</span><strong>${data.summary.signalBatches}</strong></div>
        <div class="metric"><span class="muted">可投資訊號</span><strong>${data.summary.investableSignals}</strong></div>
        <div class="metric"><span class="muted">已追蹤標的</span><strong>${data.summary.trackedTargets}</strong></div>
        <div class="metric"><span class="muted">回測交易</span><strong>${data.summary.trades}</strong></div>
      </div>
    </section>
    <section class="grid">
      <div class="card">
        <h2>今天可以先看什麼</h2>
        <ul>
          <li>先看 <a href="/scoreboard/index.html">命中展示</a>，確認哪些訊號型態比較值得信。</li>
          <li>再看 <a href="/targets/index.html">標的頁</a>，找自己的持股或觀察名單。</li>
          <li>最後讀 <a href="/methodology/index.html">方法論</a>，理解適用情境與限制。</li>
        </ul>
      </div>
      <div class="card">
        <h2>這些頁面是拿來做什麼的</h2>
        <ul>
          <li>把通知變成可追蹤、可回頭驗證的產品資產。</li>
          <li>讓使用者不是只收到一句 summary，而是能一路看到標的頁與歷史表現。</li>
          <li>提供 Google / ChatGPT / Perplexity 可讀的實體頁、FAQ 與方法論內容。</li>
        </ul>
      </div>
    </section>
    <section class="card">
      <h2>最新訊號</h2>
      <div class="signal-list">
        ${data.latestSignals.length ? data.latestSignals.slice(0, 8).map(renderSignalCard).join('') : '<p class="muted">尚未產生任何 report-*.json 檔案。</p>'}
      </div>
      <p><a href="/signals/index.html">查看完整訊號 archive →</a></p>
    </section>
    <section class="card">
      <h2>最值得先看的標的</h2>
      ${data.targets.length
        ? `<table>
            <thead><tr><th>標的</th><th>訊號數</th><th>高信心</th><th>回測交易</th><th>最新訊號</th></tr></thead>
            <tbody>
              ${data.targets
                .slice(0, 12)
                .map(
                  (target) => `<tr>
                    <td><a href="/targets/${target.slug}.html">${escapeHtml(target.name)}</a><div class="muted">${escapeHtml(target.type)}</div></td>
                    <td>${target.signalCount}</td>
                    <td>${target.highConfidenceCount}</td>
                    <td>${target.backtest.tradeCount}</td>
                    <td>${escapeHtml(target.latestSignalAt)}</td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>`
        : '<p class="muted">尚未有標的資料。</p>'}
    </section>`,
    {
      canonicalPath: '/index.html',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: '8zz Banini Tracker',
        description,
        inLanguage: 'zh-Hant',
      },
    },
  );
}

function renderSignalsIndexPage(data: ProductSiteData): string {
  return renderLayout(
    '8zz 訊號 Archive',
    '把每一次 report 都變成可回看、可搜尋、可引用的訊號頁，讓單次通知變成歷史資產。',
    `<section class="card">
      <h2>全部訊號批次</h2>
      <p class="muted">這裡收錄每一批已存檔的訊號，方便回頭驗證摘要、原文、原因、信心與可投資標的。</p>
      <div class="signal-list">
        ${data.latestSignals.length
          ? data.latestSignals.map(renderSignalCard).join('')
          : '<p class="muted">尚未產生任何訊號 archive。</p>'}
      </div>
    </section>`,
    { canonicalPath: '/signals/index.html' },
  );
}

function renderScoreboardPage(data: ProductSiteData): string {
  return renderLayout(
    '8zz 反指標命中展示｜Backtest Scoreboard',
    '集中展示巴逆逆訊號的回測摘要、熱門標的歷史命中與不同 herAction 類型的勝率輪廓。',
    `<section class="card">
      <h2>整體回測摘要</h2>
      ${renderLookaheadTable(data.scoreboard.overall)}
    </section>
    <section class="grid">
      <div class="card">
        <h2>熱門標的排行榜</h2>
        ${data.scoreboard.topTargets.length
          ? `<table>
              <thead><tr><th>標的</th><th>交易數</th><th>首個觀察窗勝率</th><th>平均報酬</th></tr></thead>
              <tbody>
                ${data.scoreboard.topTargets
                  .map(
                    (target) => `<tr>
                      <td><a href="/targets/${target.slug}.html">${escapeHtml(target.name)}</a></td>
                      <td>${target.tradeCount}</td>
                      <td>${target.winRate.toFixed(1)}%</td>
                      <td>${target.averageReturnPct.toFixed(2)}%</td>
                    </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>`
          : '<p class="muted">尚無回測排行榜資料。</p>'}
      </div>
      <div class="card">
        <h2>herAction 類型輪廓</h2>
        ${data.scoreboard.actions.length
          ? `<table>
              <thead><tr><th>動作</th><th>交易數</th><th>勝率</th><th>平均報酬</th></tr></thead>
              <tbody>
                ${data.scoreboard.actions
                  .map(
                    (action) => `<tr>
                      <td>${escapeHtml(action.action)}</td>
                      <td>${action.tradeCount}</td>
                      <td>${action.winRate.toFixed(1)}%</td>
                      <td>${action.averageReturnPct.toFixed(2)}%</td>
                    </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>`
          : '<p class="muted">尚無 herAction 統計資料。</p>'}
      </div>
    </section>`,
    { canonicalPath: '/scoreboard/index.html' },
  );
}

function renderMethodologyPage(data: ProductSiteData): string {
  const faqItems = [
    {
      question: '這個方法論在做什麼？',
      answer:
        '把巴逆逆貼文抓進來後，用既有 LLM 規則判斷她提到的標的、herAction、反指標方向與信心，再把結果存成結構化訊號資產。',
    },
    {
      question: '命中展示頁的數字怎麼來？',
      answer:
        '來自 backtest-*.json。系統會把每筆可對應到個股或 ETF 的訊號，對齊台股日線資料，計算貼文後第 1 / 3 / 5 天等觀察窗的勝負與平均報酬。',
    },
    {
      question: '這些資料可以直接拿去下單嗎？',
      answer:
        '不行。這些頁面主要用來建立可驗證與可學習的產品層，幫你節省整理時間，但不保證未來也會維持相同效果。',
    },
  ];
  return renderLayout(
    '8zz 反指標方法論｜如何判讀、回測與使用',
    '整理 8zz Banini Tracker 的訊號判讀流程、回測規則、限制與產品化方向，讓新手也能快速理解這個系統。 ',
    `<section class="card">
      <h2>方法論流程</h2>
      <ol>
        <li>抓取 Threads / Facebook 貼文，保留原文、時間與來源。</li>
        <li>用 LLM 萃取標的、herAction、反指標方向、信心與摘要。</li>
        <li>把結果存成結構化訊號，供訊號中心、標的頁與未來 watchlist 使用。</li>
        <li>用回測結果補上可驗證層，讓使用者知道哪些型態過去比較有參考價值。</li>
      </ol>
    </section>
    <section class="grid">
      <div class="card">
        <h2>什麼情況比較值得看</h2>
        <ul>
          <li>高信心、明確提到個股或 ETF 的訊號。</li>
          <li>herAction 很清楚，例如買入、加碼、停損賣出。</li>
          <li>標的頁上已累積過多筆歷史紀錄，可回頭驗證。</li>
        </ul>
      </div>
      <div class="card">
        <h2>限制與風險</h2>
        <ul>
          <li>非個股 / ETF 的提及目前通常不會進入績效統計。</li>
          <li>純圖片、梗圖、語意模糊的貼文可能只會留下通知，不一定有可投資訊號。</li>
          <li>回測是研究工具，不是保證，實盤還要看市場環境與風險控管。</li>
        </ul>
      </div>
    </section>
    <section class="card">
      <h2>目前資料量</h2>
      <p>已收錄 ${data.summary.signalBatches} 批訊號、${data.summary.investableSignals} 個可投資提及、${data.summary.trades} 筆回測交易。</p>
    </section>
    <section class="card">
      <h2>常見問題</h2>
      ${faqItems
        .map(
          (item) => `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`,
        )
        .join('')}
    </section>`,
    {
      canonicalPath: '/methodology/index.html',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqItems.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      },
    },
  );
}

function renderFaqPage(): string {
  const questions = [
    ['8zz Banini Tracker 是什麼？', '它是把 8zz 的社群貼文抓下來，做 AI 反指標分析，再整理成通知、歷史報告與回測資料的工具。'],
    ['為什麼要做標的頁？', '因為使用者真正需要的是「我自己的標的今天有沒有被提到、過去準不準」，不是只看單次通知。'],
    ['為什麼要做這些靜態頁？', '因為目前 repo 本來只有 CLI，缺少產品介面與 SEO/GEO 載體；靜態頁是把資料變成可被搜尋、被引用、被理解的第一步。'],
    ['未來付費版最適合賣什麼？', '更快通知、watchlist、自訂篩選、完整歷史資料、進階回測與更多可驗證訊號層。'],
  ];
  return renderLayout(
    '8zz Banini Tracker FAQ',
    '快速回答 8zz 反指標產品、方法論、SEO/GEO 頁面與未來付費化方向的常見問題。',
    `<section class="card">
      ${questions
        .map(([question, answer]) => `<h2>${escapeHtml(question)}</h2><p>${escapeHtml(answer)}</p>`)
        .join('')}
    </section>`,
    {
      canonicalPath: '/faq/index.html',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: questions.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: answer,
          },
        })),
      },
    },
  );
}

function renderTargetsIndexPage(data: ProductSiteData): string {
  return renderLayout(
    '8zz 標的訊號頁索引',
    '集中整理目前已出現過的個股、ETF、原物料等標的頁，方便追蹤歷史訊號與回測表現。',
    `<section class="card">
      <h2>全部標的頁</h2>
      ${data.targets.length
        ? `<table>
            <thead><tr><th>標的</th><th>類型</th><th>訊號數</th><th>回測交易</th><th>最近訊號</th></tr></thead>
            <tbody>
              ${data.targets
                .map(
                  (target) => `<tr>
                    <td><a href="/targets/${target.slug}.html">${escapeHtml(target.name)}</a></td>
                    <td>${escapeHtml(target.type)}</td>
                    <td>${target.signalCount}</td>
                    <td>${target.backtest.tradeCount}</td>
                    <td>${escapeHtml(target.latestSignalAt)}</td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>`
        : '<p class="muted">尚未產生標的資料。</p>'}
    </section>`,
    { canonicalPath: '/targets/index.html' },
  );
}

function renderTargetPage(target: TargetPageRecord): string {
  const description = `${target.name} 的 8zz 歷史訊號頁，整理她提到這個標的時的 herAction、反指標方向與回測表現。`;
  return renderLayout(
    `${target.name}｜8zz 歷史訊號頁`,
    description,
    `<section class="hero">
      <p>${escapeHtml(target.name)} 是目前已被系統追蹤的 ${escapeHtml(target.type)} 標的之一。這頁把它的歷史訊號、常見 herAction 與回測摘要集中在一起，讓使用者能快速判斷值不值得追。</p>
      <div class="metrics">
        <div class="metric"><span class="muted">訊號數</span><strong>${target.signalCount}</strong></div>
        <div class="metric"><span class="muted">高信心</span><strong>${target.highConfidenceCount}</strong></div>
        <div class="metric"><span class="muted">回測交易</span><strong>${target.backtest.tradeCount}</strong></div>
        <div class="metric"><span class="muted">最近訊號</span><strong style="font-size:1rem">${escapeHtml(target.latestSignalAt)}</strong></div>
      </div>
    </section>
    <section class="grid">
      <div class="card">
        <h2>常見 herAction</h2>
        ${target.actions.length ? target.actions.map((action) => `<span class="tag">${escapeHtml(action)}</span>`).join('') : '<p class="muted">尚無資料。</p>'}
        <h2>常見方向</h2>
        ${target.directions.length ? target.directions.map((direction) => `<span class="tag">${escapeHtml(direction)}</span>`).join('') : '<p class="muted">尚無資料。</p>'}
      </div>
      <div class="card">
        <h2>回測摘要</h2>
        ${renderLookaheadTable(target.backtest.byLookahead)}
      </div>
    </section>
    <section class="card">
      <h2>最近訊號</h2>
      ${target.recentMentions.length
        ? target.recentMentions
            .map(
              (mention) => `<article class="signal-item">
                <div class="eyebrow">${escapeHtml(mention.generatedAt)}</div>
                <h3><a href="/signals/${mention.signalId}.html">${escapeHtml(mention.summary)}</a></h3>
                <p><span class="tag">${escapeHtml(mention.herAction)}</span><span class="tag">${escapeHtml(mention.reverseView)}</span><span class="tag">${escapeHtml(mention.confidence)}</span></p>
                <p class="muted">${escapeHtml(mention.reasoning || '無額外原因說明')}</p>
              </article>`,
            )
            .join('')
        : '<p class="muted">尚無歷史訊號資料。</p>'}
    </section>`,
    { canonicalPath: `/targets/${target.slug}.html` },
  );
}

function renderSignalDetailPage(signal: SignalBatchRecord): string {
  const mentionsSummary = signal.mentions.length
    ? signal.mentions
        .map((mention) => `${mention.name} ${mention.reverseView}（${mention.confidence}）`)
        .join('、')
    : '這批貼文沒有形成可投資訊號';
  return renderLayout(
    `${signal.summary}｜8zz 訊號詳情`,
    `${signal.generatedAt} 的 8zz 訊號詳情頁，整理摘要、原文預覽、提及標的、方向、信心與可行動建議。`,
    `<section class="hero">
      <p>這頁把單次通知拆開來看：不只看 summary，也能回頭確認當時提到哪些標的、為什麼判成這個方向，以及當下建議怎麼觀察。</p>
      <div class="metrics">
        <div class="metric"><span class="muted">訊號時間</span><strong style="font-size:1rem">${escapeHtml(signal.generatedAt)}</strong></div>
        <div class="metric"><span class="muted">提及標的</span><strong>${signal.mentions.length}</strong></div>
        <div class="metric"><span class="muted">Threads / FB</span><strong>${signal.sourceBreakdown.threads} / ${signal.sourceBreakdown.facebook}</strong></div>
        <div class="metric"><span class="muted">Mood score</span><strong>${signal.moodScore ?? '—'}</strong></div>
      </div>
    </section>
    <section class="card">
      <h2>結論</h2>
      <p>${escapeHtml(signal.summary)}</p>
      ${signal.actionableSuggestion ? `<h3>可行動建議</h3><p>${escapeHtml(signal.actionableSuggestion)}</p>` : ''}
      ${signal.chainAnalysis ? `<h3>脈絡判讀</h3><p>${escapeHtml(signal.chainAnalysis)}</p>` : ''}
    </section>
    <section class="grid">
      <div class="card">
        <h2>提及標的</h2>
        ${signal.mentions.length
          ? signal.mentions
              .map(
                (mention) => `<article class="signal-item">
                  <h3><a href="/targets/${mention.slug}.html">${escapeHtml(mention.name)}</a></h3>
                  <p><span class="tag">${escapeHtml(mention.type)}</span><span class="tag">${escapeHtml(mention.herAction)}</span><span class="tag">${escapeHtml(mention.reverseView)}</span><span class="tag">${escapeHtml(mention.confidence)}</span></p>
                  <p class="muted">${escapeHtml(mention.reasoning || '無額外原因說明')}</p>
                </article>`,
              )
              .join('')
          : '<p class="muted">這批貼文未形成可投資訊號。</p>'}
      </div>
      <div class="card">
        <h2>可引用摘要</h2>
        <p>${escapeHtml(mentionsSummary)}</p>
        <p class="muted">適合用在 SEO / GEO 場景：這頁提供明確的時間、標的、方向、信心與方法論上下文。</p>
      </div>
    </section>
    <section class="card">
      <h2>原文預覽</h2>
      ${signal.posts.length
        ? `<table>
            <thead><tr><th>來源</th><th>時間</th><th>內容</th><th>連結</th></tr></thead>
            <tbody>
              ${signal.posts
                .map(
                  (post) => `<tr>
                    <td>${escapeHtml(post.source)}</td>
                    <td>${escapeHtml(post.timestamp)}</td>
                    <td>${escapeHtml(post.preview)}</td>
                    <td><a href="${escapeHtml(post.url)}">原文</a></td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>`
        : '<p class="muted">尚無原文預覽。</p>'}
    </section>`,
    {
      canonicalPath: `/signals/${signal.id}.html`,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: signal.summary,
        description: `${signal.generatedAt} 的 8zz 訊號詳情頁`,
        datePublished: signal.generatedAt,
      },
    },
  );
}

function writeProductData(data: ProductSiteData, outputDir: string): void {
  const dataDir = join(outputDir, 'data');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'catalog.json'), JSON.stringify(data, null, 2), 'utf-8');
  writeFileSync(join(dataDir, 'signals.json'), JSON.stringify(data.latestSignals, null, 2), 'utf-8');
  writeFileSync(join(dataDir, 'targets.json'), JSON.stringify(data.targets, null, 2), 'utf-8');
  writeFileSync(join(dataDir, 'scoreboard.json'), JSON.stringify(data.scoreboard, null, 2), 'utf-8');
}

function writeSeoFiles(data: ProductSiteData, outputDir: string): void {
  const urls = [
    '/index.html',
    '/signals/index.html',
    '/scoreboard/index.html',
    '/methodology/index.html',
    '/faq/index.html',
    '/targets/index.html',
    ...data.latestSignals.map((signal) => `/signals/${signal.id}.html`),
    ...data.targets.map((target) => `/targets/${target.slug}.html`),
  ];
  writeFileSync(join(outputDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`, 'utf-8');
  writeFileSync(
    join(outputDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url><loc>${SITE_ORIGIN}${url}</loc><lastmod>${data.generatedAt}</lastmod></url>`,
  )
  .join('\n')}
</urlset>`,
    'utf-8',
  );
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function clearGeneratedHtmlFiles(path: string): void {
  if (!existsSync(path)) return;
  for (const entry of readdirSync(path)) {
    if (entry.endsWith('.html') && entry !== 'index.html') {
      unlinkSync(join(path, entry));
    }
  }
}

export function buildProductSite(dataDir = join(process.cwd(), 'data'), outputDir = join(process.cwd(), 'site')): ProductSiteData {
  const reportArchives = listReportArchives(dataDir);
  const backtestArchives = listBacktestArchives(dataDir);
  const data = buildSiteData(reportArchives, backtestArchives);

  ensureDir(outputDir);
  ensureDir(join(outputDir, 'signals'));
  ensureDir(join(outputDir, 'scoreboard'));
  ensureDir(join(outputDir, 'methodology'));
  ensureDir(join(outputDir, 'faq'));
  ensureDir(join(outputDir, 'targets'));
  clearGeneratedHtmlFiles(join(outputDir, 'signals'));
  clearGeneratedHtmlFiles(join(outputDir, 'targets'));

  writeProductData(data, outputDir);
  writeFileSync(join(outputDir, 'index.html'), renderHomePage(data), 'utf-8');
  writeFileSync(join(outputDir, 'signals', 'index.html'), renderSignalsIndexPage(data), 'utf-8');
  writeFileSync(join(outputDir, 'scoreboard', 'index.html'), renderScoreboardPage(data), 'utf-8');
  writeFileSync(join(outputDir, 'methodology', 'index.html'), renderMethodologyPage(data), 'utf-8');
  writeFileSync(join(outputDir, 'faq', 'index.html'), renderFaqPage(), 'utf-8');
  writeFileSync(join(outputDir, 'targets', 'index.html'), renderTargetsIndexPage(data), 'utf-8');
  for (const signal of data.latestSignals) {
    writeFileSync(join(outputDir, 'signals', `${signal.id}.html`), renderSignalDetailPage(signal), 'utf-8');
  }
  for (const target of data.targets) {
    writeFileSync(join(outputDir, 'targets', `${target.slug}.html`), renderTargetPage(target), 'utf-8');
  }
  writeSeoFiles(data, outputDir);

  return data;
}
