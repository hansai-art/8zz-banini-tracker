import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchThreadsPosts } from '../src/threads.ts';

test('fetchThreadsPosts normalizes Apify thread data', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      json: async () => [
        {
          post_code: 'abc123',
          text_content: '最新貼文',
          created_at: '2026-04-09T10:00:00.000Z',
          like_count: 12,
          reply_count: 4,
          media_type: 'photo',
          media_url: 'https://example.com/pic.jpg',
        },
        {
          id: 'fallback-id',
          caption: '備援欄位',
          timestamp: '2026-04-09T09:00:00.000Z',
          likeCount: 5,
          replyCount: 2,
          url: 'https://threads.net/custom-url',
          media_type: 'video',
          media_url: 'https://example.com/video.mp4',
        },
        {
          pk: 999,
          text: '第三篇',
        },
      ],
    } as Response;
  }) as typeof fetch;

  const posts = await fetchThreadsPosts('banini31', 'secret-token', 2);

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://api.apify.com/v2/acts/futurizerush~meta-threads-scraper/run-sync-get-dataset-items',
  );
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    mode: 'user',
    usernames: ['banini31'],
    max_posts: 2,
  });
  assert.deepEqual(posts[0], {
    id: 'abc123',
    text: '最新貼文',
    timestamp: '2026-04-09T10:00:00.000Z',
    likeCount: 12,
    replyCount: 4,
    url: 'https://www.threads.net/@banini31/post/abc123',
    mediaType: 'photo',
    mediaUrl: 'https://example.com/pic.jpg',
  });
  assert.equal(posts[1].id, 'fallback-id');
  assert.equal(posts[1].text, '備援欄位');
  assert.equal(posts[1].timestamp, '2026-04-09T09:00:00.000Z');
  assert.equal(posts[1].url, 'https://threads.net/custom-url');
  assert.equal(posts[1].mediaType, 'video');
  assert.equal(posts[1].mediaUrl, 'https://example.com/video.mp4');
  assert.equal(posts[2].id, '999');
  assert.equal(posts[2].text, '第三篇');
  assert.equal(posts[2].mediaType, 'text');
});

test('fetchThreadsPosts throws with response details on failure', async () => {
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 503,
      text: async () => 'service unavailable',
    }) as Response) as typeof fetch;

  await assert.rejects(
    fetchThreadsPosts('banini31', 'secret-token', 1),
    /Apify 請求失敗: 503 service unavailable/,
  );
});

test('fetchThreadsPosts tolerates unreadable error bodies', async () => {
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('cannot read body');
      },
    }) as Response) as typeof fetch;

  await assert.rejects(fetchThreadsPosts('banini31', 'secret-token', 1), /Apify 請求失敗: 500 /);
});
