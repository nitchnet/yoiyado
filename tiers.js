// 宵宿：会員資格の一覧と、予約ごとに効くチェックイン／チェックアウト時刻のルール。
// 会員ステータス（status.html）と予約一覧（bookings.html）の両方で使う。
// 今の資格は画面で選んで保存（Apps Script の STATUS_MANUAL.tiers）。未設定のときは下の def を使う。
// 出典：各社公式・比較記事（2026-10-07時点）。制度は変わることがある。

const PROGRAMS = [
  {key: 'hilton', name: 'ヒルトン・オナーズ', hotels: ['hilton'],
   tiers: ['メンバー', 'シルバー', 'ゴールド', 'ダイヤモンド', 'ダイヤモンド・リザーブ'], def: 'ゴールド',
   next: {'ゴールド': 'ダイヤモンド：ヒルトン・アメックス・プレミアムで年200万円（1〜12月）。300万円で週末無料宿泊をもう1泊',
          'ダイヤモンド': '維持：翌年も年200万円'},
   perks: {'ゴールド': '朝食またはお食事クレジット・空室次第のアップグレード・ポイント80%増し',
           'ダイヤモンド': 'エグゼクティブラウンジ・朝食2名・スイートも対象のアップグレード（空室次第）',
           'ダイヤモンド・リザーブ': '予約時アップグレード確約・16:00アウト保証'}},
  {key: 'hyatt', name: 'ワールド オブ ハイアット', hotels: ['hyatt'],
   tiers: ['メンバー', 'ディスカバリスト', 'エクスプローリスト', 'グローバリスト'], def: 'メンバー',
   next: {'メンバー': 'グローバリスト：1〜12月に公式予約で60泊（10泊でディスカバリスト、30泊でエクスプローリスト）',
          'ディスカバリスト': 'グローバリスト：年60泊', 'エクスプローリスト': 'グローバリスト：年60泊'},
   perks: {'メンバー': '会員料金・Wi-Fi', 'ディスカバリスト': '空室次第のアップグレード・14時頃までの延長',
           'エクスプローリスト': '空室次第のアップグレード・14時頃までの延長',
           'グローバリスト': 'クラブラウンジと朝食・16:00アウト（依頼で付与）・スイート確約特典'}},
  {key: 'keio', name: '京王プラザ エグゼクティブカード', hotels: ['keio'],
   tiers: ['ブルーム', 'プライム', 'ロイヤル'], def: 'ロイヤル',
   next: {'ロイヤル': '維持：3月〜翌2月に公式で30万円以上（税別）', 'プライム': 'ロイヤル：3月〜翌2月に30万円以上', 'ブルーム': 'プライム：年10万円以上'},
   perks: {'ロイヤル': '15:00アウト・会員料金（約10%引き）・ポイント5pt', 'プライム': '13:00アウト・ポイント3pt', 'ブルーム': 'ポイント2pt'}},
  {key: 'iprefer', name: 'I Prefer（京王・ニューオータニのI Prefer予約）', hotels: ['iprefer', 'newotani'],
   tiers: ['メンバー', 'シルバー', 'ゴールド', 'チタニウム'], def: 'チタニウム',
   next: {'チタニウム': '最上位（12か月で5万ポイント）'},
   perks: {'チタニウム': 'アップグレード・アーリーチェックイン・レイトチェックアウト（いずれも空室次第）・飲食特典。朝食・ラウンジは付かない'}},
  {key: 'gha', name: 'GHA DISCOVERY（グルーヴ・BELLUSTAR）', hotels: ['groove', 'bellustar'],
   tiers: ['シルバー', 'ゴールド', 'プラチナ', 'チタニウム'], def: 'シルバー',
   next: {'シルバー': 'プラチナ：1〜12月に2ブランド（または10泊・5,000ドル）', 'ゴールド': 'プラチナ：1〜12月に2ブランド',
          'プラチナ': 'チタニウム：1〜12月に3ブランド（または30泊・15,000ドル）。東急ホテルズが2027年4月から加盟'},
   perks: {'シルバー': 'D$ 4%・会員料金', 'ゴールド': 'D$ 5%',
           'プラチナ': 'D$ 6%・1カテゴリー上へアップグレード（空室次第）・15:00アウト',
           'チタニウム': 'D$ 7%・2カテゴリー上へアップグレード（空室次第）・11:00イン・16:00アウト'}},
  {key: 'ikyu', name: '一休.com', hotels: [], site: true,
   tiers: ['レギュラー', 'ゴールド', 'プラチナ', 'ダイヤモンド'], def: 'ダイヤモンド', next: {}, perks: {}},
  {key: 'expedia', name: 'Expedia（One Key）', hotels: [], site: true,
   tiers: ['ブルー', 'シルバー', 'ゴールド', 'プラチナ'], def: 'ゴールド', next: {}, perks: {}},
];

// ホテルの標準時刻（会員特典なし）
const BASE_TIMES = {
  keio: ['14:00', '11:00'], iprefer: ['14:00', '11:00'], newotani: ['15:00', '12:00'], hilton: ['15:00', '11:00'],
  hyatt: ['14:00', '11:00'], kimpton: ['15:00', '11:00'], groove: ['15:00', '11:00'], bellustar: ['15:00', '12:00'],
};

function currentTiers(manual){
  const t = ((manual || {}).tiers) || {};
  const o = {};
  PROGRAMS.forEach(p => o[p.key] = t['tier_' + p.key] || p.def);
  return o;
}

// GHA：同じ年に公式予約で2ブランド（3ブランド）泊まり終えた日から、プラチナ（チタニウム）になる見込み
function ghaProjection(rows){
  const out = {};
  const years = {};
  (rows || []).filter(r => r.status === 'booked' && r.channel === '公式' && (r.hotel === 'groove' || r.hotel === 'bellustar'))
    .sort((a, b) => a.checkout < b.checkout ? -1 : 1)
    .forEach(r => {
      const y = r.checkin.slice(0, 4), s = years[y] = years[y] || {brands: new Set()};
      if (s.brands.has(r.hotel)) return;
      s.brands.add(r.hotel);
      if (s.brands.size === 2) s.plat = r.checkout;
      if (s.brands.size === 3) s.tita = r.checkout;
    });
  Object.keys(years).forEach(y => out[y] = {platinum: years[y].plat || '', titanium: years[y].tita || ''});
  return out;
}

const TIER_RANK = {gha: ['シルバー', 'ゴールド', 'プラチナ', 'チタニウム']};

// 予約1件について、使えるチェックイン／チェックアウトと根拠の資格を返す
function stayTimes(r, tiers, proj){
  const base = BASE_TIMES[r.hotel] || ['', ''];
  let ci = base[0], co = base[1], why = '', how = '';
  const direct = r.channel === '公式';
  if (r.hotel === 'keio' && direct) {
    const t = tiers.keio;
    if (t === 'ロイヤル') { co = '15:00'; why = 'ロイヤル'; how = '会員特典'; }
    else if (t === 'プライム') { co = '13:00'; why = 'プライム'; how = '会員特典'; }
    else why = t;
  } else if ((r.hotel === 'iprefer' || r.hotel === 'newotani') && r.channel === 'I Prefer') {
    why = 'I Prefer ' + tiers.iprefer; how = tiers.iprefer === 'チタニウム' ? '延長は空室次第' : '';
  } else if (r.hotel === 'hilton' && direct) {
    const t = tiers.hilton;
    if (t === 'ダイヤモンド・リザーブ') { co = '16:00'; why = t; how = '保証'; }
    else if (t === 'ゴールド' || t === 'ダイヤモンド') { why = t; how = '延長はリクエスト制'; }
    else why = t;
  } else if (r.hotel === 'hyatt' && direct) {
    const t = tiers.hyatt;
    if (t === 'グローバリスト') { co = '16:00'; why = t; how = '依頼で付与'; }
    else if (t === 'ディスカバリスト' || t === 'エクスプローリスト') { co = '14:00頃'; why = t; how = '空室次第'; }
    else why = t;
  } else if ((r.hotel === 'groove' || r.hotel === 'bellustar') && direct) {
    let t = tiers.gha, est = false;
    const rank = TIER_RANK.gha, y = Number(r.checkin.slice(0, 4));
    // 取った年の残りと翌年いっぱい有効なので、前年に達成していればその年も対象
    [y, y - 1].forEach(yy => {
      const p = (proj || {})[yy] || {};
      if (p.titanium && r.checkin >= p.titanium && rank.indexOf('チタニウム') > rank.indexOf(t)) { t = 'チタニウム'; est = true; }
      if (p.platinum && r.checkin >= p.platinum && rank.indexOf('プラチナ') > rank.indexOf(t)) { t = 'プラチナ'; est = true; }
    });
    if (t === 'チタニウム') { ci = '11:00'; co = '16:00'; }
    else if (t === 'プラチナ') { co = '15:00'; }
    why = 'GHA ' + t + (est ? '見込み' : '');
  } else if (!direct && r.channel) {
    why = r.channel + '経由'; how = 'ホテルの会員特典なし';
  }
  return {ci, co, why, how};
}
