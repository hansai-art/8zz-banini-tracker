const API_BASE = 'https://api.telegram.org/bot';

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
