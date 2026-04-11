import { buildProductSite } from './product-site.js';

const siteData = buildProductSite();

console.log('[Site] 已產生靜態產品頁面');
console.log(`[Site] 訊號批次：${siteData.summary.signalBatches}`);
console.log(`[Site] 標的頁：${siteData.summary.trackedTargets}`);
console.log(`[Site] 回測交易：${siteData.summary.trades}`);
