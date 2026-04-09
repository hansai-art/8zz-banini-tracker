import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchFacebookPosts } from '../src/facebook.ts';

test('fetchFacebookPosts normalizes Apify facebook data and OCR text', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      json: async () => [
        {
          postId: 'fb-1',
          message: '粉專貼文',
          time: '2026-04-09T11:00:00.000Z',
          likes: 20,
          comments: 6,
          shares: 3,
          url: 'https://facebook.com/posts/1',
          media: [
            {
              __typename: 'Photo',
              thumbnail: 'https://example.com/thumb.jpg',
              ocrText: '第一行',
            },
            {
              photo_image: { uri: 'https://example.com/original.jpg' },
              ocrText: '第二行',
            },
          ],
        },
        {
          id: 'fb-2',
          text: '第二篇',
          comments: 1,
          shares: 0,
        },
      ],
    } as Response;
  }) as typeof fetch;

  const posts = await fetchFacebookPosts('https://facebook.com/page', 'secret-token', 1);

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://api.apify.com/v2/acts/apify~facebook-posts-scraper/run-sync-get-dataset-items',
  );
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, 'Bearer secret-token');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    startUrls: [{ url: 'https://facebook.com/page' }],
    resultsLimit: 1,
  });
  assert.deepEqual(posts[0], {
    id: 'fb-1',
    text: '粉專貼文',
    ocrText: '第一行\n第二行',
    timestamp: '2026-04-09T11:00:00.000Z',
    likeCount: 20,
    commentCount: 6,
    shareCount: 3,
    url: 'https://facebook.com/posts/1',
    mediaType: 'photo',
    mediaUrl: 'https://example.com/thumb.jpg',
  });
  assert.equal(posts[1].id, 'fb-2');
  assert.equal(posts[1].text, '第二篇');
  assert.equal(posts[1].ocrText, '');
  assert.equal(posts[1].mediaType, 'text');
  assert.equal(posts[1].mediaUrl, '');
});

test('fetchFacebookPosts throws with response details on failure', async () => {
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    }) as Response) as typeof fetch;

  await assert.rejects(
    fetchFacebookPosts('https://facebook.com/page', 'secret-token', 1),
    /Apify FB 請求失敗: 429 rate limited/,
  );
});

test('fetchFacebookPosts tolerates unreadable error bodies', async () => {
  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 500,
      text: async () => {
        throw new Error('cannot read body');
      },
    }) as Response) as typeof fetch;

  await assert.rejects(
    fetchFacebookPosts('https://facebook.com/page', 'secret-token', 1),
    /Apify FB 請求失敗: 500 /,
  );
});
