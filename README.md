<p align="center">
  <img src="assets/banner.svg" alt="banini-tracker banner" width="100%">
</p>

# banini-tracker

追蹤「反指標女神」巴逆逆（8zz）的 Threads / Facebook 貼文；系統會持續巡檢，一抓到新貼文就立刻做 AI 反指標分析，並推送到 Telegram / Discord / LINE。

## 它做什麼

1. 透過 Apify 抓取巴逆逆的最新社群貼文（Threads + Facebook）
2. 自動去重，只處理新貼文
3. 用 LLM 進行「反指標 + 總經連鎖」分析
4. 將分析結果同步推送到 Telegram / Discord / LINE
5. 內建即時輪詢模式：作者一發文，系統下一輪檢查就會直接推送

## 反指標邏輯

巴逆逆被稱為「股海冥燈」——買什麼跌什麼，賣什麼漲什麼。AI 分析會：

- 辨識她提到的標的（個股、ETF、原物料）
- 判斷她的操作（買入 / 被套 / 停損）
- 反轉推導（她停損 → 可能反彈、她買入 → 可能下跌）
- 推導連鎖效應（油價跌 → 製造業利多 → 電子股受惠）

## 環境需求

- Node.js 20+
- [Apify](https://apify.com/) 帳號（免費額度即可）
- 任何 OpenAI 相容的 LLM API（預設 DeepInfra）
- Telegram Bot + 頻道（選用）
- Discord Webhook（選用）
- LINE Messaging API Channel（選用）

## 安裝

```bash
git clone https://github.com/CabLate/banini-tracker.git
cd banini-tracker
npm install
cp .env.example .env
```

編輯 `.env` 填入你的 API keys：

```env
APIFY_TOKEN=your_apify_token
LLM_BASE_URL=https://api.deepinfra.com/v1/openai
LLM_API_KEY=your_api_key
LLM_MODEL=MiniMaxAI/MiniMax-M2.5
TG_BOT_TOKEN=your_telegram_bot_token
TG_CHANNEL_ID=your_telegram_channel_id
DISCORD_WEBHOOK_URL=your_discord_webhook_url
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_TO=your_line_user_or_group_id
REALTIME_CRON=*/5 * * * *
REALTIME_MAX_POSTS=3
```

## 使用

### 手動執行

```bash
npm run dev              # Threads + FB 各 3 篇，AI 分析 + 通知
npm run dry              # 只抓取，不呼叫 LLM（測試用）
npm run market           # 盤中模式：FB only, 1 篇
npm run evening          # 盤後模式：Threads + FB, 各 3 篇
```

### 常駐排程（部署用）

```bash
npm run build            # TypeScript 編譯
npm run start            # 啟動常駐排程
```

預設常駐模式會使用台北時間每 5 分鐘檢查一次 Threads + Facebook；只要抓到新貼文，就會立刻推送到你有設定的通知管道。

你也可以自行調整：

```env
REALTIME_CRON=*/10 * * * *   # 改成每 10 分鐘輪詢一次
REALTIME_MAX_POSTS=5         # 每輪最多抓 5 篇，避免漏掉連發貼文
```

> 注意：輪詢越頻繁，Apify 與 LLM 成本就越高；想省錢就把 `REALTIME_CRON` 拉長一點。

## 超詳細新手教學（給程式笨蛋）

如果你平常幾乎沒碰過程式，也可以照下面做。

### 1. 先準備好 4 樣東西

1. 一台可以上網的電腦（Windows / macOS 都可以）
2. [Node.js 20 以上](https://nodejs.org/)
3. 一個 [Apify](https://apify.com/) 帳號
4. 一個 OpenAI 相容 LLM API Key（例如 DeepInfra）

安裝 Node.js 時，直接去官網下載 **LTS 版本**，一路按下一步即可。

### 2. 把專案抓到你的電腦

如果你有安裝 Git：

```bash
git clone https://github.com/CabLate/banini-tracker.git
cd banini-tracker
```

如果你沒有安裝 Git，也可以在 GitHub 頁面按 **Code → Download ZIP**，下載後解壓縮，再用終端機切到該資料夾。

### 3. 安裝專案需要的東西

在專案資料夾執行：

```bash
npm install
```

看到安裝完成就可以。

### 4. 建立你的設定檔

執行：

```bash
cp .env.example .env
```

然後用記事本、VS Code 或任何文字編輯器打開 `.env`。

### 5. 先填最基本的 3 個欄位

```env
APIFY_TOKEN=你的 Apify Token
LLM_API_KEY=你的 LLM API Key
LLM_MODEL=MiniMaxAI/MiniMax-M2.5
```

- `APIFY_TOKEN`：登入 Apify 後到設定頁面建立
- `LLM_API_KEY`：你購買或申請的模型平台金鑰
- `LLM_MODEL`：如果你不知道要填什麼，就維持預設值

### 6. 想推送到哪裡，就填哪一組通知

#### Telegram

你需要：

1. 跟 `@BotFather` 建立一個 Bot
2. 拿到 Bot Token
3. 把 Bot 加進你的頻道或群組
4. 找到頻道 / 群組 ID

填入：

```env
TG_BOT_TOKEN=你的 Telegram Bot Token
TG_CHANNEL_ID=你的頻道或群組 ID
```

#### Discord

你需要：

1. 打開 Discord 伺服器設定
2. 進入 **整合 → Webhooks**
3. 建立一個新的 Webhook
4. 複製 Webhook URL

填入：

```env
DISCORD_WEBHOOK_URL=你的 Discord Webhook URL
```

#### LINE

你需要：

1. 到 [LINE Developers](https://developers.line.biz/) 建立 Messaging API Channel
2. 取得 Channel access token
3. 讓 Bot 加入你要接收通知的聊天室
4. 找到接收目標 ID（使用者、群組或聊天室 ID 都可以）

填入：

```env
LINE_CHANNEL_ACCESS_TOKEN=你的 LINE Channel Access Token
LINE_TO=接收通知的使用者或群組 ID
```

### 7. 先做一次測試

```bash
npm run dry
```

這一步只會抓資料，不會送去做 AI 分析，適合先確認抓文流程有沒有壞掉。

如果你想直接測完整流程：

```bash
npm run dev
```

### 8. 開啟「作者一發文就推送」模式

```bash
npm run build
npm run start
```

系統會持續在背景依照 `REALTIME_CRON` 設定巡檢；預設每 5 分鐘檢查一次，有新貼文就立刻推送。

### 9. 想讓它更快或更省錢

修改 `.env`：

```env
REALTIME_CRON=*/5 * * * *    # 更快，幾乎即時，但比較花 API 額度
REALTIME_CRON=*/15 * * * *   # 比較省錢，但通知會慢一些
REALTIME_MAX_POSTS=3
```

### 10. 常見問題

#### 沒收到通知

- Telegram：確認 Bot 有加入頻道，而且有發文權限
- Discord：確認 Webhook URL 沒貼錯
- LINE：確認 Bot 有加入聊天室，而且 `LINE_TO` 是正確的目標 ID

#### 執行後直接報錯

先看你是不是少填這些欄位：

- `APIFY_TOKEN`
- `LLM_API_KEY`
- 至少一組通知設定

#### 有抓到貼文但沒分析內容

可能是：

- 該篇貼文是純圖片
- LLM API 暫時失敗

這種情況下，系統仍然會直接把原文連結推送出去，不會整批靜悄悄消失。

## 專案結構

```
src/
  index.ts       # 主程式 + 排程邏輯
  threads.ts     # Apify Threads Scraper 封裝
  facebook.ts    # Apify Facebook Scraper 封裝
  analyze.ts     # LLM 反指標分析（prompt + 呼叫）
  telegram.ts    # Telegram Bot 通知
  discord.ts     # Discord Webhook 通知
  line.ts        # LINE Messaging API 推送
  report.ts      # 各平台共用的通知內容格式化
data/            # 執行資料（gitignore）
  seen.json      # 已處理貼文 ID（去重用）
  report-*.json  # 每次分析結果存檔
```

## 免責聲明

本專案僅供娛樂參考，不構成任何投資建議。
