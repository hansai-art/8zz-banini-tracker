import { splitMessage } from './report.js';

const DISCORD_MAX_LEN = 1900;

export interface DiscordConfig {
  webhookUrl: string;
}

export async function sendDiscordMessage(
  config: DiscordConfig,
  text: string,
): Promise<void> {
  const chunks = splitMessage(text, DISCORD_MAX_LEN);

  for (const chunk of chunks) {
    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: chunk }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Discord 發送失敗: ${res.status} ${body.slice(0, 200)}`);
    }
  }
}
