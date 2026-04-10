import { splitMessage } from './report.js';

const API_URL = 'https://api.line.me/v2/bot/message/push';
const LINE_MAX_LEN = 4900;

export interface LineConfig {
  channelAccessToken: string;
  to: string;
}

export async function sendLinePushMessage(
  config: LineConfig,
  text: string,
): Promise<void> {
  const messages = splitMessage(text, LINE_MAX_LEN).map((chunk) => ({
    type: 'text',
    text: chunk,
  }));

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.channelAccessToken}`,
    },
    body: JSON.stringify({
      to: config.to,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LINE 發送失敗: ${res.status} ${body.slice(0, 200)}`);
  }
}
