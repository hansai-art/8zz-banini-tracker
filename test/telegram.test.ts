import test from 'node:test';
import assert from 'node:assert/strict';
import { formatReport, sendTelegramMessage } from '../src/telegram.ts';

test('sendTelegramMessage sends HTML payload to Telegram API', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return { ok: true } as Response;
  }) as typeof fetch;

  await sendTelegramMessage({ botToken: 'bot-token', channelId: '@channel' }, 'hello');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.telegram.org/botbot-token/sendMessage');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    chat_id: '@channel',
    text: 'hello',
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
});

test('sendTelegramMessage surfaces Telegram error details', async () => {
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 400,
      text: async () => 'bad request from telegram',
    }) as Response) as typeof fetch;

  await assert.rejects(
    sendTelegramMessage({ botToken: 'bot-token', channelId: '@channel' }, 'hello'),
    /Telegram 發送失敗: 400 bad request from telegram/,
  );
});

test('formatReport renders investment analysis with escaping and arrows', () => {
  const message = formatReport(
    {
      summary: '重點摘要',
      hasInvestmentContent: true,
      mentionedTargets: [
        {
          name: '台積電',
          type: '個股',
          herAction: '停損賣出',
          reverseView: '可能反彈上漲',
          confidence: '高',
          reasoning: '她一賣就漲',
        },
      ],
      chainAnalysis: '台積電反彈帶動半導體族群。',
      actionableSuggestion: '留意權值股轉強。',
      moodScore: 8,
    },
    { threads: 1, fb: 2 },
    [
      {
        source: 'threads',
        timestamp: '2026/04/09 10:00:00',
        isToday: true,
        text: '測試 <b>內容</b>\n第二行',
      },
    ],
  );

  assert.match(message, /<b>巴逆逆反指標速報<\/b>/);
  assert.match(message, /TH \[今天\] 2026\/04\/09 10:00:00｜測試 &lt;b&gt;內容&lt;\/b&gt; 第二行/);
  assert.match(message, /↑ <b>台積電<\/b>（個股）/);
  assert.match(message, /她：停損賣出 → 反指標：可能反彈上漲 \[高\]/);
  assert.match(message, /<b>連鎖推導<\/b>\n台積電反彈帶動半導體族群。/);
  assert.match(message, /冥燈指數：8\/10/);
});

test('formatReport renders non-investment batches clearly', () => {
  const message = formatReport(
    {
      summary: '今天只是生活分享',
      hasInvestmentContent: false,
    },
    { threads: 0, fb: 1 },
    [
      {
        source: 'facebook',
        timestamp: '2026/04/08 08:00:00',
        isToday: false,
        text: '純生活文',
      },
    ],
  );

  assert.match(message, /今天只是生活分享/);
  assert.match(message, /（本批貼文與投資無關）/);
});

test('formatReport truncates long facebook previews and uses FB label', () => {
  const message = formatReport(
    {
      summary: '摘要',
      hasInvestmentContent: false,
    },
    { threads: 0, fb: 1 },
    [
      {
        source: 'facebook',
        timestamp: '2026/04/08 08:00:00',
        isToday: false,
        text: 'a'.repeat(60),
      },
    ],
  );

  assert.match(message, /FB 2026\/04\/08 08:00:00｜a{50}…/);
});
