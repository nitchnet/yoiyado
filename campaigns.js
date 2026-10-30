// 宵宿：キャンペーンと予約台帳の突き合わせ（キャンペーン・予約の2ページで共用）
// キャンペーンは毎朝 campaigns.py がメールから抽出（Claude API）。登録状況は画面のボタンで記録（Apps Script の CAMPAIGN_STATUS）。

const CP_BRAND_HOTELS = {  // ブランド全体のキャンペーンが効くホテルと予約経路
  hyatt: { hotels: ['hyatt', 'park_hyatt', 'grand_hyatt'], channel: '公式' },
  hilton: { hotels: ['hilton'], channel: '公式' },
  gha: { hotels: ['groove', 'bellustar'], channel: '公式' },
  iprefer: { hotels: ['iprefer', 'newotani'], channel: 'I Prefer' },
  tokyu: { hotels: ['capitol', 'cerulean'], channel: '公式' },
  keio: { hotels: ['keio'], channel: '公式' },
  ikyu: { hotels: null, channel: '一休' },  // 一休経由の予約すべて
};
const CP_SOURCE_NAME = { hyatt: 'ハイアット', hilton: 'ヒルトン', gha: 'GHA／パンパシフィック', iprefer: 'I Prefer', tokyu: '東急ホテルズ', keio: '京王プラザ', ikyu: '一休' };
const CP_KIND = { price: '料金', status: '資格', points: 'ポイント', other: 'その他' };
const CP_COMPARED = new Set(['keio', 'iprefer', 'newotani', 'groove', 'bellustar', 'hilton', 'hyatt', 'kimpton']);
const CP_STATUS_LABEL = { registered: '登録済み', na: '対象外', unknown: '未確認' };

const cpToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// 登録状況：画面で記録したもの → 本文に「登録済み」とあったもの → 未確認
function cpStatus(c, statusMap) {
  const s = (statusMap || {})[c.id];
  if (s && s.s) return s.s;
  return c.registered ? 'registered' : 'unknown';
}

// 期限：登録締切・予約期間の終わり・宿泊期間の終わりのうち一番遅いもの（どれも無ければ受信から45日）
function cpEnd(c) {
  const ds = [c.registration_deadline, c.booking_end, c.stay_end].filter(Boolean).sort();
  if (ds.length) return ds[ds.length - 1];
  const d = new Date(c.received + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 45);
  return d.toISOString().slice(0, 10);
}
// 予約期間が終わったものも期限切れ（もう予約できないため・2026-10-24）
const cpExpired = c => cpEnd(c) < cpToday() || (!!c.booking_end && c.booking_end < cpToday());
// 同じ案内（同じ制度・同じ名前）が何通も来たときは、新しい1件にまとめる
const cpSameKey = c => (c.source || '') + '|' + String(c.name || '').replace(/[\s　・:：|｜\-–—()（）【】\[\]「」]/g, '').toLowerCase();
function cpDedupe(list) {
  const by = {};
  list.forEach(c => { const k = cpSameKey(c); (by[k] = by[k] || []).push(c); });
  return Object.values(by).map(g => { g.sort((a, b) => (a.received || '') < (b.received || '') ? 1 : -1); return Object.assign({}, g[0], { dup: g.length - 1 }); });
}

// このキャンペーンの対象になりうる今後の予約（宿泊期間が重なる・ホテルと予約経路が合う）
function cpMatches(c, rows) {
  if (!c.stay_start && !c.stay_end) return [];
  // 特定のブランドだけが対象（例：Thompson Hotels だけ）なら、手元の予約はどれも対象外（2026-10-30 西村氏の指摘）
  if ((c.bonus || {}).brand_ok === false) return [];
  const b = CP_BRAND_HOTELS[c.source] || {};
  const hotels = c.scope === 'hotels' && (c.hotels || []).length ? c.hotels : b.hotels;
  const today = cpToday();
  return (rows || []).filter(r => r.status === 'booked' && r.checkin && r.checkout > today
    && (!c.stay_start || r.checkin >= c.stay_start) && (!c.stay_end || r.checkin <= c.stay_end)
    && (!hotels || hotels.indexOf(r.hotel) >= 0)
    && (!b.channel || r.channel === b.channel));
}

// 警告：事前登録が必要・対象の予約がある・まだ「登録済み」「対象外」にしていない
function cpWarn(c, rows, statusMap) {
  if (!c.registration_required) return [];
  const s = cpStatus(c, statusMap);
  if (s === 'registered' || s === 'na') return [];
  return cpMatches(c, rows);
}

// 並び順：①要登録かつ予約と重なる ②資格 ③比較対象ホテルの値下げ ④ポイント ⑤その他。同じ組は期限の近い順
function cpRank(c, rows, statusMap) {
  if (cpWarn(c, rows, statusMap).length) return 1;
  if (c.kind === 'status') return 2;
  const b = CP_BRAND_HOTELS[c.source] || {};
  const hs = c.scope === 'hotels' ? (c.hotels || []) : (b.hotels || []);
  if (c.kind === 'price' && hs.some(h => CP_COMPARED.has(h))) return 3;
  if (c.kind === 'points') return 4;
  return 5;
}

// 予約1件ごとの警告（予約ページ用）
function cpWarningsByBooking(campaigns, rows, statusMap) {
  const out = {};
  (campaigns || []).filter(c => !cpExpired(c)).forEach(c => {
    cpWarn(c, rows, statusMap).forEach(r => { (out[r.key] = out[r.key] || []).push(c); });
  });
  return out;
}
