import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalysisResponse } from '../src/analyze.ts';

test('parseAnalysisResponse parses JSON from a fenced block', () => {
  const result = parseAnalysisResponse(`分析如下：\n\`\`\`json\n{"hasInvestmentContent":true,"summary":"反指標成立"}\n\`\`\``);

  assert.deepEqual(result, {
    hasInvestmentContent: true,
    summary: '反指標成立',
  });
});

test('parseAnalysisResponse parses bare JSON content', () => {
  const result = parseAnalysisResponse('前言 {"hasInvestmentContent":false,"summary":"生活文"} 結尾');

  assert.deepEqual(result, {
    hasInvestmentContent: false,
    summary: '生活文',
  });
});

test('parseAnalysisResponse throws when JSON is missing', () => {
  assert.throws(() => parseAnalysisResponse('這裡沒有可解析的內容'), /找不到 JSON/);
});

test('parseAnalysisResponse throws when JSON is malformed', () => {
  assert.throws(
    () => parseAnalysisResponse('```json\n{"hasInvestmentContent":true,"summary":}\n```'),
    /JSON 格式錯誤/,
  );
});
