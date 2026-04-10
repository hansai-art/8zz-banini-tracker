import type { BaniniAnalysis } from './analyze.js';

const API_BASE = 'https://api.telegram.org/bot';

const EMPTY_POST_TEXT = '（無文字，可能是圖片貼文）';

interface LegacyPostCount {
  threads: number;
  fb: number;
}

interface LegacyPostSummary {
  source: 'threads' | 'facebook';
  timestamp: string;
  isToday: boolean;
  text: string;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shortenText(text: string, maxLen: number): string {
  const normalized = text.replace(/\n/g, ' ').trim();
  if (!normalized) return EMPTY_POST_TEXT;
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen)}…` : normalized;
}

export function formatReport(
  analysis: BaniniAnalysis,
  postCount: LegacyPostCount,
  posts: LegacyPostSummary[],
): string {
  const lines: string[] = [];
  lines.push('<b>巴逆逆反指標速報</b>');
  lines.push(`來源：Threads ${postCount.threads} 篇 / FB ${postCount.fb} 篇`);
  lines.push('');

  for (const p of posts) {
    const src = p.source === 'threads' ? 'TH' : 'FB';
    const todayTag = p.isToday ? ' [今天]' : '';
    lines.push(`${src}${todayTag} ${escapeHtml(p.timestamp)}｜${escapeHtml(shortenText(p.text, 50))}`);
  }

  lines.push('');
  lines.push(escapeHtml(analysis.summary));

  if (analysis.hasInvestmentContent) {
    if (analysis.mentionedTargets?.length) {
      lines.push('');
      for (const t of analysis.mentionedTargets) {
        const arrow =
          t.reverseView.includes('漲') || t.reverseView.includes('彈')
            ? '↑'
            : t.reverseView.includes('跌')
              ? '↓'
              : '→';
        lines.push(`${arrow} <b>${escapeHtml(t.name)}</b>（${escapeHtml(t.type)}）`);
        lines.push(`她：${escapeHtml(t.herAction)} → 反指標：${escapeHtml(t.reverseView)} [${escapeHtml(t.confidence)}]`);
        if (t.reasoning) lines.push(escapeHtml(t.reasoning));
      }
    }
    if (analysis.chainAnalysis) {
      lines.push('');
      lines.push(`<b>連鎖推導</b>\n${escapeHtml(analysis.chainAnalysis)}`);
    }
    if (analysis.actionableSuggestion) {
      lines.push('');
      lines.push(`<b>建議方向</b>\n${escapeHtml(analysis.actionableSuggestion)}`);
    }
    if (analysis.moodScore) {
      lines.push('');
      lines.push(`冥燈指數：${analysis.moodScore}/10`);
    }
  } else {
    lines.push('');
    lines.push('（本批貼文與投資無關）');
  }

  return lines.join('\n');
}

export interface TelegramConfig {
  botToken: string;
  channelId: string;
}

export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
): Promise<void> {
  const url = `${API_BASE}${config.botToken}/sendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.channelId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telegram 發送失敗: ${res.status} ${body.slice(0, 200)}`);
  }
}
