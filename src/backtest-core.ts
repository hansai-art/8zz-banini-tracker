import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { analyzePosts, type BaniniAnalysis } from './analyze.js';
import { fetchFacebookPosts } from './facebook.js';
import { fetchThreadsPosts } from './threads.js';

const THREADS_USERNAME = 'banini31';
const FB_PAGE_URL = 'https://www.facebook.com/DieWithoutBang/';
const DATA_DIR = join(process.cwd(), 'data');
const DEFAULT_LOOKAHEAD_DAYS = [1, 3, 5];

export interface BacktestOptions {
  apifyToken: string;
  llmConfig: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  days: number;
  maxPosts: number;
  lookaheadDays: number[];
  fbOnly: boolean;
  threadsOnly: boolean;
}

interface UnifiedPost {
  id: string;
  source: 'threads' | 'facebook';
  text: string;
  ocrText: string;
  timestamp: string;
  url: string;
}

interface SecurityInfo {
  market: 'listed' | 'otc';
  code: string;
  name: string;
}

interface PricePoint {
  date: string;
  close: number;
}

type SignalDirection = 'long' | 'short';

export interface BacktestTrade {
  postId: string;
  postTimestamp: string;
  source: 'threads' | 'facebook';
  url: string;
  targetName: string;
  targetType: string;
  herAction: string;
  reverseView: string;
  confidence: string;
  signalDirection: SignalDirection;
  matchedSymbol: string;
  matchedName: string;
  entryDate: string;
  entryClose: number;
  results: Array<{
    lookaheadDays: number;
    exitDate: string;
    exitClose: number;
    returnPct: number;
    outcome: 'win' | 'loss' | 'flat';
  }>;
}

export interface BacktestSummaryRow {
  lookaheadDays: number;
  wins: number;
  losses: number;
  flats: number;
  winRate: number;
  averageReturnPct: number;
}

export interface BacktestReport {
  generatedAt: string;
  windowDays: number;
  fetchedPosts: number;
  analyzedPosts: number;
  skippedNonInvestmentPosts: number;
  skippedUnresolvedTargets: number;
  skippedInsufficientPriceData: number;
  lookaheadDays: number[];
  summary: BacktestSummaryRow[];
  trades: BacktestTrade[];
}

function fromThreads(post: Awaited<ReturnType<typeof fetchThreadsPosts>>[number]): UnifiedPost {
  return {
    id: post.id,
    source: 'threads',
    text: post.text,
    ocrText: '',
    timestamp: post.timestamp,
    url: post.url,
  };
}

function fromFacebook(post: Awaited<ReturnType<typeof fetchFacebookPosts>>[number]): UnifiedPost {
  return {
    id: `fb_${post.id}`,
    source: 'facebook',
    text: post.text,
    ocrText: post.ocrText,
    timestamp: post.timestamp,
    url: post.url,
  };
}

function formatTaipeiDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatTaipeiTime(date: Date): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function getPostBody(post: UnifiedPost): string {
  if (post.text.trim() && post.ocrText.trim()) {
    return `${post.text}\n[圖片 OCR]\n${post.ocrText}`;
  }
  return post.text.trim() || post.ocrText.trim();
}

function looksLikeInvestmentPost(text: string): boolean {
  const normalized = text.replace(/\s+/g, '');
  return /[0-9]{4}|買|賣|停損|加碼|抄底|做多|做空|看多|看空|股票|台股|ETF|大盤|原油/.test(
    normalized,
  );
}

function inferSignalDirection(reverseView: string): SignalDirection | null {
  if (/(上漲|反彈|續漲|走高|偏多|看多|做多|噴|漲)/.test(reverseView)) return 'long';
  if (/(下跌|續跌|走低|偏空|看空|做空|回檔|跌)/.test(reverseView)) return 'short';
  return null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, '').replace(/股份有限公司/g, '').trim();
}

function parseNumber(value: string): number {
  return Number.parseFloat(value.replace(/,/g, '').replace(/--/g, ''));
}

function rocToIsoDate(input: string): string {
  const match = input.match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/);
  if (!match) return input;
  const year = Number.parseInt(match[1], 10) + 1911;
  return `${year}-${match[2]}-${match[3]}`;
}

function chunkMonthKeys(startDate: Date, endDate: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const limit = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
  while (cursor <= limit) {
    const year = cursor.getUTCFullYear();
    const month = `${cursor.getUTCMonth() + 1}`.padStart(2, '0');
    keys.push(`${year}-${month}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

function buildTwseMonthUrl(code: string, yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  return `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${year}${month}01&stockNo=${code}`;
}

function buildTpexMonthUrl(code: string, yearMonth: string): string {
  const [year, month] = yearMonth.split('-');
  const rocYear = Number.parseInt(year, 10) - 1911;
  return `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading/st43_result.php?l=zh-tw&d=${rocYear}/${month}/01&stkno=${code}&s=0,asc`;
}

export function scoreTrade(resultPct: number, signalDirection: SignalDirection): 'win' | 'loss' | 'flat' {
  if (resultPct === 0) return 'flat';
  if (signalDirection === 'long') return resultPct > 0 ? 'win' : 'loss';
  return resultPct < 0 ? 'win' : 'loss';
}

export function summarizeTrades(trades: BacktestTrade[], lookaheadDays: number[]): BacktestSummaryRow[] {
  return lookaheadDays.map((lookaheadDaysValue) => {
    const rows = trades
      .map((trade) => trade.results.find((result) => result.lookaheadDays === lookaheadDaysValue))
      .filter((result): result is BacktestTrade['results'][number] => Boolean(result));
    const wins = rows.filter((row) => row.outcome === 'win').length;
    const losses = rows.filter((row) => row.outcome === 'loss').length;
    const flats = rows.filter((row) => row.outcome === 'flat').length;
    const decided = wins + losses;
    const averageReturnPct = rows.length
      ? rows.reduce((sum, row) => sum + row.returnPct, 0) / rows.length
      : 0;
    return {
      lookaheadDays: lookaheadDaysValue,
      wins,
      losses,
      flats,
      winRate: decided === 0 ? 0 : (wins / decided) * 100,
      averageReturnPct,
    };
  });
}

export function formatBacktestSummary(report: BacktestReport): string {
  const lines: string[] = [];
  lines.push('巴逆逆反指標回測');
  lines.push(`期間：過去 ${report.windowDays} 天`);
  lines.push(`抓到貼文：${report.fetchedPosts} 篇`);
  lines.push(`實際分析：${report.analyzedPosts} 篇`);
  lines.push(`可回測交易：${report.trades.length} 筆`);
  lines.push('');
  lines.push('勝率摘要');
  for (const row of report.summary) {
    lines.push(
      `${row.lookaheadDays} 天：${row.wins} 勝 / ${row.losses} 負 / ${row.flats} 平，勝率 ${row.winRate.toFixed(1)}%，平均報酬 ${row.averageReturnPct.toFixed(2)}%`,
    );
  }
  lines.push('');
  lines.push(
    `略過：非投資貼文 ${report.skippedNonInvestmentPosts}、無法對應股票 ${report.skippedUnresolvedTargets}、價格資料不足 ${report.skippedInsufficientPriceData}`,
  );
  return lines.join('\n');
}

class TaiwanMarketDataClient {
  private securitiesPromise: Promise<Map<string, SecurityInfo>> | null = null;
  private priceCache = new Map<string, Promise<PricePoint[]>>();

  async resolveSecurity(nameOrCode: string): Promise<SecurityInfo | null> {
    const securities = await this.loadSecurities();
    const normalized = normalizeName(nameOrCode);
    return securities.get(normalized) ?? null;
  }

  async loadPrices(security: SecurityInfo, startDate: Date, endDate: Date): Promise<PricePoint[]> {
    const monthKeys = chunkMonthKeys(startDate, endDate);
    const results = await Promise.all(
      monthKeys.map((monthKey) => {
        const cacheKey = `${security.market}:${security.code}:${monthKey}`;
        const cached = this.priceCache.get(cacheKey);
        if (cached) return cached;
        const promise =
          security.market === 'listed'
            ? this.fetchTwseMonth(security.code, monthKey)
            : this.fetchTpexMonth(security.code, monthKey);
        this.priceCache.set(cacheKey, promise);
        return promise;
      }),
    );
    return results
      .flat()
      .filter((point) => point.date >= formatTaipeiDate(startDate) && point.date <= formatTaipeiDate(endDate))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private async loadSecurities(): Promise<Map<string, SecurityInfo>> {
    if (!this.securitiesPromise) {
      this.securitiesPromise = this.fetchSecurities();
    }
    return this.securitiesPromise;
  }

  private async fetchSecurities(): Promise<Map<string, SecurityInfo>> {
    const [listed, otc] = await Promise.all([
      this.fetchSecurityList(
        'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
        'listed',
      ),
      this.fetchSecurityList(
        'https://www.tpex.org.tw/openapi/v1/tpex_main_board_stocks',
        'otc',
      ),
    ]);
    const map = new Map<string, SecurityInfo>();
    for (const security of [...listed, ...otc]) {
      map.set(security.code, security);
      map.set(normalizeName(security.name), security);
    }
    return map;
  }

  private async fetchSecurityList(url: string, market: SecurityInfo['market']): Promise<SecurityInfo[]> {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) {
      throw new Error(`股票清單抓取失敗: ${response.status} ${await response.text().catch(() => '')}`);
    }
    const records = (await response.json()) as Array<Record<string, unknown>>;
    return records
      .map((record) => ({
        market,
        code: pickString(record, ['公司代號', '證券代號', '股票代號', 'SecuritiesCompanyCode', 'CompanyCode']),
        name: pickString(record, ['公司簡稱', '公司名稱', '證券名稱', '股票名稱', 'CompanyName', 'SecuritiesCompanyName']),
      }))
      .filter((security) => /^\d{4,6}$/.test(security.code) && security.name.length > 0);
  }

  private async fetchTwseMonth(code: string, yearMonth: string): Promise<PricePoint[]> {
    const response = await fetch(buildTwseMonthUrl(code, yearMonth), {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`上市股價抓取失敗 ${code} ${yearMonth}: ${response.status}`);
    }
    const payload = (await response.json()) as {
      stat?: string;
      data?: string[][];
    };
    if (payload.stat && !payload.stat.includes('OK')) return [];
    return (payload.data ?? [])
      .map((row) => ({
        date: rocToIsoDate(row[0] ?? ''),
        close: parseNumber(row[6] ?? ''),
      }))
      .filter((point) => point.date.includes('-') && Number.isFinite(point.close) && point.close > 0);
  }

  private async fetchTpexMonth(code: string, yearMonth: string): Promise<PricePoint[]> {
    const response = await fetch(buildTpexMonthUrl(code, yearMonth), {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`上櫃股價抓取失敗 ${code} ${yearMonth}: ${response.status}`);
    }
    const payload = (await response.json()) as {
      aaData?: string[][];
      iTotalRecords?: number;
    };
    if (!payload.aaData?.length && !payload.iTotalRecords) return [];
    return payload.aaData
      ?.map((row) => ({
        date: rocToIsoDate(row[0] ?? ''),
        close: parseNumber(row[8] ?? ''),
      }))
      .filter((point) => point.date.includes('-') && Number.isFinite(point.close) && point.close > 0) ?? [];
  }
}

async function analyzeSinglePost(post: UnifiedPost, llmConfig: BacktestOptions['llmConfig']): Promise<BaniniAnalysis> {
  const postTime = formatTaipeiTime(new Date(post.timestamp));
  const content = getPostBody(post);
  return analyzePosts([{ text: content, timestamp: postTime, isToday: false }], llmConfig);
}

function buildTrade(
  post: UnifiedPost,
  target: NonNullable<BaniniAnalysis['mentionedTargets']>[number],
  security: SecurityInfo,
  prices: PricePoint[],
  lookaheadDays: number[],
): BacktestTrade | null {
  const signalDirection = inferSignalDirection(target.reverseView);
  if (!signalDirection) return null;

  const entryIndex = prices.findIndex((point) => point.date > formatTaipeiDate(new Date(post.timestamp)));
  if (entryIndex < 0) return null;
  const entry = prices[entryIndex];
  const results = lookaheadDays
    .map((lookaheadDay) => {
      const exit = prices[entryIndex + lookaheadDay];
      if (!exit) return null;
      const returnPct = ((exit.close - entry.close) / entry.close) * 100;
      return {
        lookaheadDays: lookaheadDay,
        exitDate: exit.date,
        exitClose: exit.close,
        returnPct,
        outcome: scoreTrade(returnPct, signalDirection),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (results.length === 0) return null;

  return {
    postId: post.id,
    postTimestamp: post.timestamp,
    source: post.source,
    url: post.url,
    targetName: target.name,
    targetType: target.type,
    herAction: target.herAction,
    reverseView: target.reverseView,
    confidence: target.confidence,
    signalDirection,
    matchedSymbol: security.code,
    matchedName: security.name,
    entryDate: entry.date,
    entryClose: entry.close,
    results,
  };
}

export async function runBacktest(options: BacktestOptions): Promise<BacktestReport> {
  const startDate = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);
  const endDate = new Date();
  const marketDataClient = new TaiwanMarketDataClient();
  const posts: UnifiedPost[] = [];

  if (!options.fbOnly) {
    const threadsPosts = await fetchThreadsPosts(THREADS_USERNAME, options.apifyToken, options.maxPosts);
    posts.push(...threadsPosts.map(fromThreads));
  }

  if (!options.threadsOnly) {
    const facebookPosts = await fetchFacebookPosts(FB_PAGE_URL, options.apifyToken, options.maxPosts);
    posts.push(...facebookPosts.map(fromFacebook));
  }

  const recentPosts = posts
    .filter((post) => new Date(post.timestamp).getTime() >= startDate.getTime())
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const trades: BacktestTrade[] = [];
  let analyzedPosts = 0;
  let skippedNonInvestmentPosts = 0;
  let skippedUnresolvedTargets = 0;
  let skippedInsufficientPriceData = 0;

  for (const [index, post] of recentPosts.entries()) {
    const content = getPostBody(post);
    if (!content.trim() || !looksLikeInvestmentPost(content)) {
      skippedNonInvestmentPosts += 1;
      continue;
    }

    analyzedPosts += 1;
    console.log(`[Backtest] 分析貼文 ${index + 1}/${recentPosts.length}: ${post.source} ${post.url}`);

    const analysis = await analyzeSinglePost(post, options.llmConfig);
    if (!analysis.hasInvestmentContent || !analysis.mentionedTargets?.length) {
      skippedNonInvestmentPosts += 1;
      continue;
    }

    for (const target of analysis.mentionedTargets) {
      if (!['個股', 'ETF'].includes(target.type)) {
        skippedUnresolvedTargets += 1;
        continue;
      }

      const security = await marketDataClient.resolveSecurity(target.name);
      if (!security) {
        skippedUnresolvedTargets += 1;
        continue;
      }

      const maxLookahead = Math.max(...options.lookaheadDays, ...DEFAULT_LOOKAHEAD_DAYS);
      const priceEndDate = new Date(endDate.getTime());
      const priceStartDate = new Date(new Date(post.timestamp).getTime() - 10 * 24 * 60 * 60 * 1000);
      priceEndDate.setDate(priceEndDate.getDate() + maxLookahead + 10);
      const prices = await marketDataClient.loadPrices(security, priceStartDate, priceEndDate);

      const trade = buildTrade(post, target, security, prices, options.lookaheadDays);
      if (!trade) {
        skippedInsufficientPriceData += 1;
        continue;
      }

      trades.push(trade);
    }
  }

  const report: BacktestReport = {
    generatedAt: new Date().toISOString(),
    windowDays: options.days,
    fetchedPosts: recentPosts.length,
    analyzedPosts,
    skippedNonInvestmentPosts,
    skippedUnresolvedTargets,
    skippedInsufficientPriceData,
    lookaheadDays: options.lookaheadDays,
    summary: summarizeTrades(trades, options.lookaheadDays),
    trades,
  };

  mkdirSync(DATA_DIR, { recursive: true });
  const outputPath = join(DATA_DIR, `backtest-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`);
  writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`[Backtest] 結果已存檔: ${outputPath}`);

  return report;
}
