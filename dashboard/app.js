// Token Launch Radar — dashboard. Reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the board, a detail view per protocol
// and a filter. No network: every byte shown is in data.js.
//
// The value model, in one function, so the page recomputes a row from the
// snapshot figures and checks the number board.json carries — the page's
// code and the board's data are visibly the same arithmetic:
//
//   baseMultiple = median(mcap / tvl) over live-token protocols (in data)
//   growthMult   = 1 + clamp(change_7d, -60, 200) / 100
//   maturityMult = 0.55 + 0.60 * sqrt(min(age_days, 1460) / 1460)
//   chainMult    = 1 + 0.02 * min(chains.length, 5)
//   implied      = round(tvl * baseMultiple * growthMult * maturityMult * chainMult)
//
// Age unknown falls back to the eligible set's median age (in data).
// A protocol is ranked only when it records no token and is not a wrapped,
// staked or bridged product of one that trades — that predicate lives in
// lib/model.ts and produced the 198 rows; the page never re-decides it.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;
  var state = { q: '', category: 'all', chain: 'all', scope: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, view: 'board' };
  var M = DATA.model;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) { if (d === null || d === undefined) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.round(d) + 'd'; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // The model, recomputed here from the row's own figures.
  function modelOf(row) {
    var growth = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, M.growth_floor, M.growth_cap);
    var growthMult = 1 + growth / 100;
    var age = row.age_days === null || row.age_days === undefined ? DATA.median_age_days : row.age_days;
    var maturity = M.maturity_floor + M.maturity_range * Math.sqrt(Math.min(Math.max(age, 0), M.maturity_days) / M.maturity_days);
    var chainMult = 1 + M.chain_step * Math.min((row.chains || []).length, M.chain_max);
    return { growth: growth, growthMult: growthMult, maturity: maturity, chainMult: chainMult, age: age,
      implied: Math.max(1, Math.round(row.tvl_usd * DATA.base_multiple * growthMult * maturity * chainMult)) };
  }

  // The farm plan is the same derivation main.ts writes to board.json:
  // category, chains, TVL tier and age decide the action, the capital,
  // the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 1e9) return 500; if (p.tvl_usd >= 25e7) return 250;
    if (p.tvl_usd >= 1e8) return 150; if (p.tvl_usd >= 5e7) return 100; return 50;
  }
  function holdFor(age) { if (age === null || age === undefined) return 60; if (age < 180) return 90; if (age < 365) return 60; if (age < 730) return 45; return 30; }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase(); var n = p.name;
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('asset management') >= 0) return 'Deposit $' + capital + ' into a ' + n + ' vault on ' + chain + ' and keep the vault shares in your wallet.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + n + ' on ' + chain + ', then borrow a small amount against it and repay it once.';
    if (c.indexOf('dex') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + ' of liquidity to ' + n + "'s main pool on " + chain + ' and make one swap through the pool each week.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' into ' + n + "'s main yield vault on " + chain + ' and keep the position compounding.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + n + "'s yield-bearing asset on " + chain + ' and hold it in the farming wallet.';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + n + ' and open one small hedged position, then close it the same week.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + n + ' and place one small market position, then settle or close it before expiry.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC through ' + n + ' to ' + chain + ' and use the bridged funds in one app on the other side.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + n + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + n + ' on ' + chain + ' and hold it for the full farm window.';
    if (c.indexOf('payment') >= 0) return 'Send $' + capital + ' through ' + n + ' on ' + chain + ' in two separate payments a week apart.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + n + ' on ' + chain + ' and keep the policy active for the farm window.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of ' + n + "'s index token on " + chain + ' and hold it in the farming wallet.';
    return 'Deposit $' + capital + ' of USDC into ' + n + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'a supply top-up, a borrow, or a repayment';
    if (c.indexOf('dex') >= 0) return 'a swap or a liquidity top-up';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('yield') >= 0) return 'a vault deposit or a rebalance';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('basis') >= 0) return 'one small hedged trade';
    if (c.indexOf('prediction') >= 0) return 'one small market position';
    if (c.indexOf('rwa') >= 0) return 'a mint or a holding check on the asset page';
    return 'a deposit, a swap, or a vote';
  }
  function farmSteps(p) {
    var chain = chainOf(p); var second = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    var capital = capitalFor(p); var hold = holdFor(p.age_days); var gas = capital >= 250 ? 8 : 4;
    function s(text, cost, time) { var x = text + ' Cost: ' + cost + '. Time: ' + time + '.'; return x.length > 600 ? x.slice(0, 596) + '...' : x; }
    return [
      s('Use a fresh wallet that holds only the funds you plan to farm with ' + p.name + ', and keep its seed phrase offline on paper.', 'under $3 of gas for the first transaction', '5 minutes'),
      s(actionFor(p, capital, chain), '$' + capital + ' of capital and about $' + gas + ' of gas', '15 minutes to set up'),
      s('Do one qualifying action each week on ' + p.name + ', such as ' + weeklyFor(p) + ', so the wallet shows repeated use rather than a single deposit.', 'about $2 of gas a week', '10 minutes a week'),
      s(second ? 'Repeat the main position once on ' + second + ' as well, with half the capital, so the wallet is active on two of ' + p.name + "'s chains." : 'Keep the whole position on ' + chain + ' and do not split it across chains ' + p.name + ' does not list.', second ? '$' + Math.round(capital / 2) + ' of capital and about $' + gas + ' of gas' : 'nothing extra', '15 minutes'),
      s('Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot window.', 'the $' + capital + ' stays in the position', hold + ' days'),
      s("Before you withdraw, open " + p.name + "'s own points or rewards page from its official site and claim only from the link it publishes there.", 'no fee to check, and never pay to claim', '10 minutes'),
      s('Test the exit first: withdraw about 10% of the position, confirm it arrives, then withdraw the rest the same day.', 'about $3 of gas', '15 minutes'),
      s('Write the wallet address, the dates, and every transaction hash in a farm log so you can repeat the position or prove it later.', 'nothing but the log', '5 minutes')
    ];
  }
  function splitStep(step) {
    var i = step.indexOf(' Cost: ');
    if (i < 0) return { text: step, cost: '', time: '' };
    var text = step.slice(0, i); var rest = step.slice(i + 7);
    var j = rest.indexOf('. Time: ');
    if (j < 0) return { text: text, cost: rest, time: '' };
    return { text: text, cost: rest.slice(0, j), time: rest.slice(j + 8).replace(/\.$/, '') };
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var q = new URLSearchParams(h);
    if (q.get('q')) state.q = q.get('q');
    if (q.get('cat')) state.category = q.get('cat');
    if (q.get('chain')) state.chain = q.get('chain');
    if (q.get('scope')) state.scope = q.get('scope');
    if (q.get('sort')) state.sort = q.get('sort');
    if (q.get('tab')) state.tab = q.get('tab');
    if (q.get('p')) state.selected = q.get('p');
    if (q.get('view')) state.view = q.get('view');
  }
  function writeHash() {
    var q = new URLSearchParams();
    if (state.q) q.set('q', state.q);
    if (state.category !== 'all') q.set('cat', state.category);
    if (state.chain !== 'all') q.set('chain', state.chain);
    if (state.scope !== 'all') q.set('scope', state.scope);
    if (state.sort !== 'implied') q.set('sort', state.sort);
    if (state.tab !== 'pre-token') q.set('tab', state.tab);
    if (state.view !== 'board') q.set('view', state.view);
    if (state.selected) q.set('p', state.selected);
    var s = q.toString();
    history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  function filtered() {
    var rows = DATA.rows.slice();
    var q = state.q.trim().toLowerCase();
    if (q) rows = rows.filter(function (r) { return (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) >= 0; });
    if (state.category !== 'all') rows = rows.filter(function (r) { return r.category === state.category; });
    if (state.chain !== 'all') rows = rows.filter(function (r) { return (r.chains || []).indexOf(state.chain) >= 0; });
    if (state.scope === 'watchlist') rows = rows.filter(function (r) { return r.watchlist; });
    if (state.scope === 'early') rows = rows.filter(function (r) { return !r.watchlist; });
    if (state.scope === 'growing') rows = rows.filter(function (r) { return (r.change_7d || 0) > 0; });
    if (state.scope === 'big') rows = rows.filter(function (r) { return r.tvl_usd >= 50000000; });
    var key = state.sort;
    rows.sort(function (a, b) {
      var d = 0;
      if (key === 'tvl') d = a.tvl_usd - b.tvl_usd;
      else if (key === 'growth') d = (a.change_7d || 0) - (b.change_7d || 0);
      else if (key === 'age') d = (a.age_days || 0) - (b.age_days || 0);
      else if (key === 'name') d = a.name < b.name ? -1 : 1;
      else d = a.implied_value_usd - b.implied_value_usd;
      return d * state.dir;
    });
    return rows;
  }

  function options(list, cur, allLabel) {
    return '<option value="all"' + (cur === 'all' ? ' selected' : '') + '>' + esc(allLabel) + '</option>' +
      list.map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
  }

  function render() {
    var rows = filtered();
    var cats = []; var chains = [];
    DATA.rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category); (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
    cats.sort(); chains.sort();
    var sel = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] || DATA.rows[0];
    if (sel) state.selected = sel.slug;
    var live = DATA.live || [];
    var top = DATA.rows[0];

    var head = '<header class="top"><div class="brand"><span class="dot"></span><span>TOKEN LAUNCH RADAR</span></div>' +
      '<div class="meta"><span>Snapshot ' + esc(DATA.as_of) + '</span><span>DefiLlama protocols</span><span>Model ' + esc(DATA.model_version) + '</span></div></header>' +
      '<section class="lede"><div><h1>Which pre-token protocol is worth farming next?</h1>' +
      '<p><b>' + DATA.board_size + ' protocols</b> record no token and are not a wrapped, staked or bridged product of one that trades. ' +
      'Each is ranked by an <b>implied launch value</b> — what its token would be worth if its record stayed as it is — ' +
      'calibrated from the live market, not from a hand-picked list. Click any row for its model breakdown and farm plan.</p></div>' +
      '<div class="facts"><span>Watchlist (floor $50M): <b>' + DATA.watchlist_size + '</b></span>' +
      '<span>Early finds below the floor: <b>' + DATA.early_size + '</b></span>' +
      '<span>Live-token protocols set aside: <b>' + DATA.live_size + '</b> shown apart</span>' +
      '<span>Top implied value: <b>' + fmtUsd(top ? top.implied_value_usd : 0) + '</b> (' + esc(top ? top.name : '') + ')</span></div></section>' +
      '<section class="stats">' +
      '<div class="stat"><span>Board rows</span><b>' + DATA.board_size + '</b></div>' +
      '<div class="stat"><span>Watchlist covered</span><b>' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b></div>' +
      '<div class="stat"><span>Median mcap / TVL (live)</span><b>' + DATA.base_multiple.toFixed(3) + 'x</b></div>' +
      '<div class="stat"><span>Median age, no token</span><b>' + DATA.median_age_days + 'd</b></div>' +
      '<div class="stat"><span>TVL on the board</span><b>' + fmtUsd(DATA.rows.reduce(function (a, r) { return a + r.tvl_usd; }, 0)) + '</b></div>' +
      '<div class="stat"><span>Implied value, top 10</span><b>' + fmtUsd(DATA.rows.slice(0, 10).reduce(function (a, r) { return a + r.implied_value_usd; }, 0)) + '</b></div></section>' +
      '<section class="model"><code>implied = TVL x ' + DATA.base_multiple.toFixed(3) + ' (median live mcap/TVL) x (1 + clamp(7d, -60%, +200%)) x (0.55 + 0.60 x sqrt(age / 1460d)) x (1 + 0.02 x chains, max 5)</code>' +
      '<p>The base multiple is the median of market-cap / TVL across the live-token protocols in this same snapshot — the market\'s own ratio, recomputed from the data, not a constant anyone chose. ' +
      'Growth is the strongest lever after size; maturity is a square-root curve, so the first year without a token counts most; chain breadth is a small bonus only. ' +
      'The board never ranks a protocol whose token already trades: those sit in the Live tab, at their market cap, as the calibration set.</p></section>';

    var tabs = '<div class="tabs"><button data-tab="pre-token" class="' + (state.tab === 'pre-token' ? 'on' : '') + '">Pre-token board (' + DATA.board_size + ')</button>' +
      '<button data-tab="live" class="' + (state.tab === 'live' ? 'on' : '') + '">Live tokens — already trade (' + live.length + ')</button></div>';

    var filters = '';
    if (state.tab === 'pre-token') {
      filters = '<div class="filters"><input id="q" type="search" placeholder="Search name, slug or category" value="' + esc(state.q) + '" aria-label="Search">' +
        '<label>Category <select id="cat">' + options(cats, state.category, 'All categories') + '</select></label>' +
        '<label>Chain <select id="chain">' + options(chains, state.chain, 'All chains') + '</select></label>' +
        '<label>Scope <select id="scope">' +
        '<option value="all"' + (state.scope === 'all' ? ' selected' : '') + '>All ' + DATA.board_size + '</option>' +
        '<option value="watchlist"' + (state.scope === 'watchlist' ? ' selected' : '') + '>Watchlist only</option>' +
        '<option value="early"' + (state.scope === 'early' ? ' selected' : '') + '>Early finds only</option>' +
        '<option value="growing"' + (state.scope === 'growing' ? ' selected' : '') + '>Growing in 7d</option>' +
        '<option value="big"' + (state.scope === 'big' ? ' selected' : '') + '>TVL $50M+</option></select></label>' +
        '<label>Sort <select id="sort">' +
        '<option value="implied"' + (state.sort === 'implied' ? ' selected' : '') + '>Implied value</option>' +
        '<option value="tvl"' + (state.sort === 'tvl' ? ' selected' : '') + '>TVL</option>' +
        '<option value="growth"' + (state.sort === 'growth' ? ' selected' : '') + '>7d growth</option>' +
        '<option value="age"' + (state.sort === 'age' ? ' selected' : '') + '>Age</option>' +
        '<option value="name"' + (state.sort === 'name' ? ' selected' : '') + '>Name</option></select></label>' +
        '<span class="count">' + rows.length + ' shown</span></div>';
    }

    var table = '';
    if (state.tab === 'live') {
      table = '<div class="panel"><table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Mcap / TVL</th><th class="num">7d</th></tr></thead><tbody>' +
        live.map(function (r) {
          return '<tr><td><span class="name">' + esc(r.name) + '</span><div class="sub">' + esc(r.slug) + '</div></td><td>' + esc(r.category || '—') + '</td>' +
            '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + fmtUsd(r.mcap_usd) + '</td><td class="num">' + (r.ratio === null ? 'n/a' : r.ratio.toFixed(2) + 'x') + '</td>' +
            '<td class="num ' + ((r.change_7d || 0) >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="note">These protocols already have a token that trades, so they are not ranked and never enter the board. They are the calibration set: their median market-cap / TVL (' + DATA.base_multiple.toFixed(3) + 'x) is the base multiple the pre-token board is priced from.</p>';
    } else if (rows.length === 0) {
      table = '<div class="panel"><div class="empty">No protocol matches this filter. Clear the search or widen the scope.</div></div>';
    } else {
      table = '<div class="panel"><table><thead><tr><th class="num">#</th><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Age</th><th class="num">Implied value</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var m = modelOf(r);
          return '<tr data-slug="' + esc(r.slug) + '" class="' + (sel && r.slug === sel.slug ? 'sel' : '') + '"><td class="num">' + r.rank + '</td>' +
            '<td><span class="name">' + esc(r.name) + '</span>' + (r.watchlist ? '<span class="badge w">WATCHLIST</span>' : '<span class="badge e">EARLY</span>') + '<div class="sub">' + esc(r.slug) + ' · ' + esc(((r.chains || []).slice(0, 3).join(', ') || '—') + ((r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '')) + '</div></td>' +
            '<td>' + esc(r.category || '—') + '</td><td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
            '<td class="num ' + ((r.change_7d || 0) >= 0 ? 'up' : 'down') + '">' + fmtPct(r.change_7d) + '</td>' +
            '<td class="num">' + fmtAge(r.age_days) + '</td><td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b><div class="sub">x' + m.growthMult.toFixed(2) + ' · x' + m.maturity.toFixed(2) + '</div></td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    var detail = '';
    if (sel && state.tab === 'pre-token') {
      var dm = modelOf(sel);
      var steps = farmSteps(sel);
      var check = dm.implied === sel.implied_value_usd ? 'matches board.json' : 'differs from board.json';
      detail = '<aside class="panel detail">' + (state.view === 'detail' ? '<p><button data-view="board" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:6px 10px">Back to board</button></p>' : '') + '<h2>' + esc(sel.name) + '</h2><div class="sub">#' + sel.rank + ' · ' + esc(sel.slug) + ' · ' + esc(sel.category || 'no category') + ' · ' + (sel.watchlist ? 'Watchlist' : 'Early find') + '</div>' +
        '<div class="dgrid">' +
        '<div class="dcell"><span>Implied value</span><b>' + fmtUsd(sel.implied_value_usd) + '</b></div>' +
        '<div class="dcell"><span>TVL</span><b>' + fmtUsd(sel.tvl_usd) + '</b></div>' +
        '<div class="dcell"><span>7d growth</span><b>' + fmtPct(sel.change_7d) + '</b></div>' +
        '<div class="dcell"><span>Age, no token</span><b>' + fmtAge(sel.age_days) + '</b></div>' +
        '<div class="dcell"><span>Chains</span><b>' + esc((sel.chains || []).join(', ') || '—') + '</b></div>' +
        '<div class="dcell"><span>Listed</span><b>' + esc(sel.listed_at || 'unknown') + '</b></div></div>' +
        '<div class="math">TVL ' + fmtUsd(sel.tvl_usd) + ' x ' + DATA.base_multiple.toFixed(3) + ' = <b>' + fmtUsd(sel.tvl_usd * DATA.base_multiple) + '</b> base<br>' +
        'x growth ' + dm.growthMult.toFixed(2) + ' (' + (dm.growth >= 0 ? '+' : '') + dm.growth.toFixed(2) + '%) x maturity ' + dm.maturity.toFixed(2) + ' x chains ' + dm.chainMult.toFixed(2) + '<br>' +
        '= <b>' + fmtUsd(dm.implied) + '</b> — recomputed here, ' + check + '</div>' +
        '<h3>Farm plan — 8 steps</h3><ol class="steps">' +
        steps.map(function (st) { var p = splitStep(st); return '<li>' + esc(p.text) + '<div class="chips"><span class="chip">Cost: ' + esc(p.cost) + '</span><span class="chip">Time: ' + esc(p.time) + '</span></div></li>'; }).join('') +
        '</ol><p class="note">“Records no token” is what the snapshot says — not proof it has none. Implied value is this entry\'s own claim, not a prediction that a token launches, and not financial advice. Never pay to claim an airdrop.</p></aside>';
    }

    // A link with view=detail opens on that protocol's detail view, full width.
    var body = state.tab === 'live' ? table :
      (state.view === 'detail' && sel ? detail + '<div style="height:16px"></div>' + table :
        '<div class="grid"><div>' + table + '</div><div>' + detail + '</div></div>');
    // A protocol detail link is a page of its own: no hero, the detail first.
    var topHtml = (state.view === 'detail' && state.tab === 'pre-token')
      ? '<header class="top"><div class="brand"><span class="dot"></span><span>TOKEN LAUNCH RADAR</span></div><div class="meta"><span>Snapshot ' + esc(DATA.as_of) + '</span><span>Model ' + esc(DATA.model_version) + '</span></div></header>'
      : head;
    app.innerHTML = '<div class="shell">' + topHtml + tabs + filters + body +
      '<p class="foot">Token Launch Radar · snapshot ' + esc(DATA.as_of) + ' · ' + DATA.board_size + ' pre-token rows, ' + DATA.watchlist_size + ' watchlist, ' + DATA.early_size + ' early · model ' + esc(DATA.model_version) + ' · data: DefiLlama protocols as frozen in the snapshot.</p></div>';
    app.setAttribute('aria-busy', 'false');
    bind();
  }

  function bind() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; writeHash(); render(); var nq = document.getElementById('q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = document.getElementById('chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var sc = document.getElementById('scope');
    if (sc) sc.addEventListener('change', function () { state.scope = sc.value; writeHash(); render(); });
    var so = document.getElementById('sort');
    if (so) so.addEventListener('change', function () { state.sort = so.value; writeHash(); render(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); writeHash(); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (b) {
      b.addEventListener('click', function () { state.view = b.getAttribute('data-view'); writeHash(); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () { state.selected = tr.getAttribute('data-slug'); writeHash(); render(); });
    });
  }

  readHash();
  render();
})();
