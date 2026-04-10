import type { BaniniAnalysis } from './analyze.js';

export interface PostSummary {
  source: 'threads' | 'facebook';
  timestamp: string;
  isToday: boolean;
  text: string;
  url: string;
}

export interface PostCount {
  threads: number;
  fb: number;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shortenText(text: string, maxLen: number): string {
  const normalized = text.replace(/\n/g, ' ').trim();
  if (!normalized) return '（無文字，可能是圖片貼文）';
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen)}…` : normalized;
}

export function formatPlainReport(
  analysis: BaniniAnalysis,
  postCount: PostCount,
  posts: PostSummary[],
): string {
  const lines: string[] = [];
  lines.push('巴逆逆反指標速報');
  lines.push(`來源：Threads ${postCount.threads} 篇 / FB ${postCount.fb} 篇`);
  lines.push('');
  lines.push('她的動態');

  for (const p of posts) {
    const src = p.source === 'threads' ? 'TH' : 'FB';
    const todayTag = p.isToday ? ' [今天]' : '';
    lines.push(`${src}${todayTag} ${p.timestamp}`);
    lines.push(`內容：${shortenText(p.text, 80)}`);
    lines.push(`連結：${p.url}`);
    lines.push('');
  }

  lines.push(analysis.summary);

  if (analysis.hasInvestmentContent) {
    if (analysis.mentionedTargets?.length) {
      lines.push('');
      lines.push('提及標的');
      for (const t of analysis.mentionedTargets) {
        const arrow =
          t.reverseView.includes('漲') || t.reverseView.includes('彈')
            ? '↑'
            : t.reverseView.includes('跌')
              ? '↓'
              : '→';
        lines.push(`${arrow} ${t.name}（${t.type}）`);
        lines.push(`  她：${t.herAction} → 反指標：${t.reverseView} [${t.confidence}]`);
        if (t.reasoning) lines.push(`  ${t.reasoning}`);
      }
    }
    if (analysis.chainAnalysis) {
      lines.push('');
      lines.push('連鎖推導');
      lines.push(analysis.chainAnalysis);
    }
    if (analysis.actionableSuggestion) {
      lines.push('');
      lines.push('建議方向');
      lines.push(analysis.actionableSuggestion);
    }
    if (analysis.moodScore) {
      lines.push('');
      lines.push(`冥燈指數：${analysis.moodScore}/10`);
    }
  } else {
    lines.push('');
    lines.push('（本批貼文與投資無關）');
  }

  lines.push('');
  lines.push('僅供娛樂參考，不構成投資建議');
  return lines.join('\n');
}

export function formatTelegramReport(
  analysis: BaniniAnalysis,
  postCount: PostCount,
  posts: PostSummary[],
): string {
  const lines: string[] = [];
  lines.push('<b>巴逆逆反指標速報</b>');
  lines.push(`來源：Threads ${postCount.threads} 篇 / FB ${postCount.fb} 篇`);
  lines.push('');
  lines.push('<b>她的動態</b>');

  for (const p of posts) {
    const src = p.source === 'threads' ? 'TH' : 'FB';
    const todayTag = p.isToday ? ' [今天]' : '';
    lines.push(`${src}${todayTag} ${escapeHtml(p.timestamp)}`);
    lines.push(`內容：${escapeHtml(shortenText(p.text, 80))}`);
    lines.push(`連結：${escapeHtml(p.url)}`);
    lines.push('');
  }

  lines.push(escapeHtml(analysis.summary));

  if (analysis.hasInvestmentContent) {
    if (analysis.mentionedTargets?.length) {
      lines.push('');
      lines.push('<b>提及標的</b>');
      for (const t of analysis.mentionedTargets) {
        const arrow =
          t.reverseView.includes('漲') || t.reverseView.includes('彈')
            ? '↑'
            : t.reverseView.includes('跌')
              ? '↓'
              : '→';
        lines.push(`${arrow} <b>${escapeHtml(t.name)}</b>（${escapeHtml(t.type)}）`);
        lines.push(
          `  她：${escapeHtml(t.herAction)} → 反指標：${escapeHtml(t.reverseView)} [${escapeHtml(t.confidence)}]`,
        );
        if (t.reasoning) lines.push(`  ${escapeHtml(t.reasoning)}`);
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

  lines.push('');
  lines.push('<i>僅供娛樂參考，不構成投資建議</i>');
  return lines.join('\n');
}

export function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current) {
      chunks.push(current);
      current = '';
    }
  };

  for (const line of text.split('\n')) {
    if (line.length > maxLen) {
      pushCurrent();
      for (let i = 0; i < line.length; i += maxLen) {
        chunks.push(line.slice(i, i + maxLen));
      }
      continue;
    }

    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLen) {
      pushCurrent();
      current = line;
    } else {
      current = candidate;
    }
  }

  pushCurrent();
  return chunks;
}
