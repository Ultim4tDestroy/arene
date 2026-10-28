'use strict';
/* Labo du Dénicheur : backtest sur 20 cryptos (historique Binance) et simulateur de trades sur tokens récents.
   Tout est simulé : aucun ordre réel, aucune clé de portefeuille. Les états sont gardés sur l'appareil (denicheur.lab). */
(() => {

const API = 'https://api.dexscreener.com';
const DEF = {
  demo: false, balance0: 1000, stakePct: 8, maxPos: 5, stopPct: 6, trailAt: 12, trailDist: 6, maxHoldH: 6,
  minLiq: 25000, minVol1h: 50000, minAgeMin: 15, maxAgeH: 24, maxPump1h: 100, minTx1h: 50, maxFdvLiq: 40, minScore: 0.6,
  slipPct: 1.5, feePct: 1, pollSec: 30,
  maxDevPct: 10, maxInsPct: 25, exitDevDrop: 20, exitInsDrop: 25, rcPerTick: 4, rcOn: true, rcStrict: true,
};
const LIMITS = {
  balance0: [10, 1e7], stakePct: [0.5, 25], maxPos: [1, 20], stopPct: [1, 50], trailAt: [1, 500], trailDist: [1, 50], maxHoldH: [0.5, 72],
  minLiq: [0, 1e8], minVol1h: [0, 1e9], minAgeMin: [0, 1440], maxAgeH: [1, 720], maxPump1h: [10, 10000], minTx1h: [0, 1e6], maxFdvLiq: [1, 1000],
  minScore: [0, 1], slipPct: [0, 20], feePct: [0, 10], pollSec: [10, 300],
  maxDevPct: [0, 100], maxInsPct: [0, 100], exitDevDrop: [1, 100], exitInsDrop: [1, 100], rcPerTick: [1, 15],
};
const LABEL = {
  balance0: ['Capital de départ ($)', 'Fictif'], stakePct: ['Mise par trade (% du capital)', 'Maximum 25'], maxPos: ['Positions simultanées max', ''],
  stopPct: ['Stop-loss (%)', 'Sortie si le prix baisse de ce %'], trailAt: ['Stop suiveur activé après (+%)', ''], trailDist: ['Distance du stop suiveur (%)', 'Sous le plus haut atteint'],
  maxHoldH: ['Durée max d’une position (h)', ''], minLiq: ['Liquidité minimum ($)', 'Sous ce seuil : refusé'], minVol1h: ['Volume 1 h minimum ($)', ''],
  minAgeMin: ['Âge minimum (min)', 'Évite les tout premiers instants'], maxAgeH: ['Âge maximum (h)', ''], maxPump1h: ['Hausse 1 h maximum (%)', 'Au-delà : on court après le prix'],
  minTx1h: ['Transactions 1 h minimum', ''], maxFdvLiq: ['Valorisation / liquidité maximum', 'Trop élevé = prix fragile'], minScore: ['Score minimum (0 à 1)', ''],
  slipPct: ['Slippage de base (%)', 'Réaliste : 1 à 3'], feePct: ['Frais par ordre (%)', 'Réaliste : 0,5 à 1'], pollSec: ['Fréquence de scan (s)', 'Quotas gratuits : ne pas descendre sous 15'],
  maxDevPct: ['Le créateur détient au plus (%)', 'Au-delà : refusé'], maxInsPct: ['Initiés / achats groupés au plus (%)', 'Approximation RugCheck'],
  exitDevDrop: ['Sortie si le créateur vend (%)', 'Part de sa position vendue'], exitInsDrop: ['Sortie si les initiés vendent (%)', 'Baisse relative de leur part'], rcPerTick: ['Analyses RugCheck max par scan', 'Limite les appels'],
};
const RULES = { dev: 'Le créateur détient trop', bundle: 'Initiés / achats groupés trop gros', black: 'Créateur en liste noire (rug passé)', rugged: 'Déjà marqué rug par RugCheck', danger: 'Risque critique signalé par RugCheck', serial: 'Créateur en série (4 tokens ou plus)', rcunk: 'Analyse RugCheck indisponible (refusé par prudence)', age: 'Trop récent ou trop ancien', liq: 'Liquidité insuffisante', vol: 'Volume 1 h insuffisant', pump: 'Déjà monté de trop', dump: 'Chute en cours', tx: 'Pas assez de transactions', honey: 'Achats sans aucune vente (piège possible)', fdv: 'Valorisation trop élevée vs liquidité', score: 'Score trop bas', full: 'Positions max atteintes', cash: 'Capital insuffisant',
  mint: 'Autorité de création (mint) encore ouverte', freeze: 'Autorité de gel encore ouverte', risk: 'Score de risque RugCheck trop élevé', lp: 'Liquidité pas assez verrouillée', top10: 'Top 10 des détenteurs trop concentré', insn: 'Initiés détectés', share: 'Ta mise serait trop grosse pour le pool' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const numv = (v, d, [a, b]) => { if (typeof v === 'string') v = parseFloat(v.replace(/\s/g, '').replace(',', '.')); return typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : d; };
const str = (v, n = 40) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';
const usd = v => (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0, minimumFractionDigits: Math.abs(v) < 100 ? 2 : 0 });
const pc = (v, d = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d).replace('.', ',') + ' %';
const price = p => p >= 1 ? p.toFixed(3) : p >= 0.001 ? p.toFixed(5) : p.toExponential(2);
const dur = ms => { const m = Math.round(ms / 60000); return m < 60 ? m + ' min' : (m / 60).toFixed(1).replace('.', ',') + ' h'; };
const clock = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
/* ---------- État ---------- */
const fresh = () => ({ settings: { ...DEF }, black: [], running: false, cash: DEF.balance0, pos: [], closed: [], equity: [], rej: {}, seen: [], log: [], scanned: 0, passed: 0, startedAt: 0 });
function cleanSettings(r) { r = r && typeof r === 'object' ? r : {}; const s = { demo: r.demo === true, rcOn: r.rcOn !== false, rcStrict: r.rcStrict !== false }; for (const k in LIMITS) s[k] = numv(r[k], DEF[k], LIMITS[k]); return s; }
function cleanState(d) {
  const b = fresh(); if (!d || typeof d !== 'object') return b;
  b.settings = cleanSettings(d.settings);
  b.cash = numv(d.cash, b.settings.balance0, [-1e9, 1e12]);
  b.running = d.running === true;
  b.pos = (Array.isArray(d.pos) ? d.pos : []).slice(0, 50).map(p => p && typeof p === 'object' ? ({
    addr: str(p.addr, 80), sym: str(p.sym, 24) || '?', entry: numv(p.entry, 0, [0, 1e12]), qty: numv(p.qty, 0, [0, 1e30]), cost: numv(p.cost, 0, [0, 1e12]), fee: numv(p.fee, 0, [0, 1e9]),
    peak: numv(p.peak, 0, [0, 1e12]), last: numv(p.last, 0, [0, 1e12]), liq0: numv(p.liq0, 0, [0, 1e12]), liq: numv(p.liq, 0, [0, 1e12]), at: numv(p.at, 0, [0, 4e12]), score: numv(p.score, 0, [0, 1]), miss: numv(p.miss, 0, [0, 1000]),
    creator: str(p.creator, 80), dev0: numv(p.dev0, 0, [0, 100]), ins0: numv(p.ins0, 0, [0, 100]), rcAt: numv(p.rcAt, 0, [0, 4e12]),
  }) : null).filter(p => p && p.addr && p.entry > 0 && p.qty > 0);
  b.closed = (Array.isArray(d.closed) ? d.closed : []).slice(-1000).map(t => t && typeof t === 'object' ? ({
    sym: str(t.sym, 24) || '?', at: numv(t.at, 0, [0, 4e12]), to: numv(t.to, 0, [0, 4e12]), cost: numv(t.cost, 0, [0, 1e12]), out: numv(t.out, -1e12, [-1e12, 1e12]), fees: numv(t.fees, 0, [0, 1e9]),
    reason: str(t.reason, 60), score: numv(t.score, 0, [0, 1]),
  }) : null).filter(Boolean);
  b.equity = (Array.isArray(d.equity) ? d.equity : []).slice(-600).filter(e => Array.isArray(e) && Number.isFinite(e[0]) && Number.isFinite(e[1])).map(e => [e[0], e[1]]);
  if (d.rej && typeof d.rej === 'object') for (const k in RULES) b.rej[k] = numv(d.rej[k], 0, [0, 1e9]);
  b.seen = (Array.isArray(d.seen) ? d.seen : []).slice(-3000).map(x => str(x, 80)).filter(Boolean);
  b.log = (Array.isArray(d.log) ? d.log : []).slice(-300).map(l => l && typeof l === 'object' ? ({ t: numv(l.t, 0, [0, 4e12]), sym: str(l.sym, 24), msg: str(l.msg, 120), ok: l.ok === true }) : null).filter(Boolean);
  b.black = [...new Set((Array.isArray(d.black) ? d.black : []).map(x => str(x, 80)).filter(Boolean))].slice(-500);
  b.scanned = numv(d.scanned, 0, [0, 1e9]); b.passed = numv(d.passed, 0, [0, 1e9]); b.startedAt = numv(d.startedAt, 0, [0, 4e12]);
  return b;
}
const RC_API = 'https://api.rugcheck.xyz/v1/tokens';
async function fetchReport(addr) { try { return await getJSON(`${RC_API}/${encodeURIComponent(addr)}/report`); } catch { return null; } }
const num = v => v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
function parseReport(rep) {
  if (!rep || typeof rep !== 'object') return null;
  const tk = rep.token && typeof rep.token === 'object' ? rep.token : {};
  const supply = num(tk.supply), cb = num(rep.creatorBalance), creator = str(rep.creator, 80);
  const th = Array.isArray(rep.topHolders) ? rep.topHolders : null;
  let dev = null;
  if (supply > 0 && cb !== null && cb >= 0) dev = cb / supply * 100;
  else if (th && creator) { const h = th.find(x => x && (x.owner === creator || x.address === creator)); dev = h ? (Number(h.pct) || 0) : null; }
  const ins = th ? th.reduce((a, h) => a + (h && h.insider === true ? (Number(h.pct) || 0) : 0), 0) : null;
  const risks = Array.isArray(rep.risks) ? rep.risks : [];
  /* Champs ajoutés en v5 (mêmes sources, structure déduite : un champ absent donne null = inconnu, jamais « propre ») */
  const auth = k => { const v = k in tk ? tk[k] : (k in rep ? rep[k] : undefined); return v === undefined ? null : !!v; };
  const known = rep.knownAccounts && typeof rep.knownAccounts === 'object' ? rep.knownAccounts : {};
  const isPool = h => { const tag = known[h && h.owner] || known[h && h.address] || {}; return ['AMM', 'LOCKER'].includes(String(tag.type || '').toUpperCase()); };
  const holders = th ? th.filter(h => h && !isPool(h)) : null;
  const mk = Array.isArray(rep.markets) ? rep.markets.filter(m => m && typeof m === 'object') : [];
  const liqOf = m => (num(m.lp && m.lp.baseUSD) || 0) + (num(m.lp && m.lp.quoteUSD) || 0);
  const best = mk.slice().sort((a, b) => liqOf(b) - liqOf(a))[0];
  const lp = num(best && best.lp && best.lp.lpLockedPct) ?? num(rep.lpLockedPct);
  return { creator, dev, ins, rugged: rep.rugged === true, danger: risks.some(r => r && r.level === 'danger'), serial: Array.isArray(rep.creatorTokens) ? rep.creatorTokens.length : 0,
    mint: auth('mintAuthority'), freeze: auth('freezeAuthority'), lp, score: num(rep.score_normalised),
    top10: holders ? +holders.slice(0, 10).reduce((a, h) => a + (Number(h.pct) || 0), 0).toFixed(2) : null,
    insN: holders ? holders.filter(h => h.insider === true).length + (num(rep.graphInsidersDetected) || 0) : null };
}
const addBlack = c => { if (c && !SIM.black.includes(c)) { SIM.black.push(c); if (SIM.black.length > 500) SIM.black.shift(); } };
async function rcCheck(p, s) {
  const pr = parseReport(s.demo ? demoReport(p.addr) : await fetchReport(p.addr));
  const bad = (why, detail) => ({ why, detail, pr });
  if (!pr) return bad(s.rcStrict ? 'rcunk' : '', '');
  if (pr.creator && SIM.black.includes(pr.creator)) return bad('black', '');
  if (pr.rugged) { addBlack(pr.creator); return bad('rugged', ''); }
  if (pr.danger) return bad('danger', '');
  if ((pr.dev === null || pr.ins === null) && s.rcStrict) return bad('rcunk', '');
  if (pr.dev !== null && pr.dev > s.maxDevPct) return bad('dev', `${pr.dev.toFixed(0)} % > ${s.maxDevPct} %`);
  if (pr.ins !== null && pr.ins > s.maxInsPct) return bad('bundle', `${pr.ins.toFixed(0)} % > ${s.maxInsPct} %`);
  if (pr.serial > 3) return bad('serial', `${pr.serial} tokens`);
  return bad('', '');
}
async function checkInsiders() {
  const s = SIM.settings; if (!s.rcOn) return;
  for (const p of SIM.pos.slice()) {
    if (!p.creator || Date.now() - (p.rcAt || 0) < (s.demo ? 0 : 60000)) continue;
    p.rcAt = Date.now();
    const pr = parseReport(s.demo ? demoReport(p.addr) : await fetchReport(p.addr)); if (!pr) continue;
    if (p.dev0 > 0 && pr.dev !== null && pr.dev < p.dev0 * (1 - s.exitDevDrop / 100)) closePos(p, `Le créateur vend (${p.dev0.toFixed(0)} → ${pr.dev.toFixed(0)} %)`, false);
    else if (p.ins0 > 0 && pr.ins !== null && pr.ins < p.ins0 * (1 - s.exitInsDrop / 100)) closePos(p, `Les initiés vendent (${p.ins0.toFixed(0)} → ${pr.ins.toFixed(0)} %)`, false);
  }
}
const normPair = p => {
  if (!p || typeof p !== 'object' || !p.baseToken) return null;
  const px = Number(p.priceUsd), liq = Number(p.liquidity && p.liquidity.usd);
  if (!(px > 0)) return null;
  const tx = (p.txns && p.txns.h1) || {};
  return {
    addr: str(p.baseToken.address, 80), sym: str(p.baseToken.symbol, 24) || '?', px, liq: liq > 0 ? liq : 0, vol1h: Number(p.volume && p.volume.h1) || 0,
    ch1h: Number(p.priceChange && p.priceChange.h1) || 0, buys: Number(tx.buys) || 0, sells: Number(tx.sells) || 0, fdv: Number(p.fdv) || 0, created: Number(p.pairCreatedAt) || 0,
  };
};
async function fetchMarket(addrs) {
  const out = new Map();
  const add = arr => { for (const raw of Array.isArray(arr) ? arr : []) { const p = normPair(raw); if (p && p.addr && (!out.has(p.addr) || out.get(p.addr).liq < p.liq)) out.set(p.addr, p); } };
  const prof = await getJSON(`${API}/token-profiles/latest/v1`);
  const fresh = [...new Set((Array.isArray(prof) ? prof : []).filter(x => x && x.chainId === 'solana').map(x => str(x.tokenAddress, 80)).filter(Boolean))];
  const want = [...new Set([...addrs, ...fresh])].filter(a => /^[1-9A-HJ-NP-Za-km-z]{20,60}$/.test(a));
  for (let i = 0; i < want.length; i += 30) add(await getJSON(`${API}/tokens/v1/solana/${want.slice(i, i + 30).join(',')}`));
  return { map: out, fresh };
}
/* Marché fictif : prix en marche aléatoire, 20 % de rugs, pour tester sans réseau */
const DM = { tokens: new Map(), n: 0 };
function demoReport(id) {
  const t = DM.tokens.get(id); if (!t) return null;
  const hs = [{ owner: 'H1', pct: t.ins, insider: true }, { owner: 'H2', pct: Math.max(0, t.top10 - t.ins), insider: false }, { owner: 'POOL', pct: 40, insider: false }];
  return { creator: t.creator, token: { supply: 1e9, mintAuthority: t.mint ? 'AUTH' : null, freezeAuthority: t.freeze ? 'AUTH' : null }, creatorBalance: t.dev / 100 * 1e9, rugged: false, score_normalised: t.risk,
    risks: [], topHolders: hs, knownAccounts: { POOL: { type: 'AMM' } }, markets: [{ lp: { lpLockedPct: t.lp, baseUSD: t.liq / 2, quoteUSD: t.liq / 2 } }], creatorTokens: [] };
}
function demoMarket(addrs, seenArr = SIM.seen, accel = false) {
  const now = Date.now();
  for (let i = 0; i < 6; i++) {
    const id = 'DEMO' + (++DM.n) + 'x'.repeat(20), good = Math.random() < 0.7, liq = good ? 30000 + Math.random() * 150000 : 4000 + Math.random() * 40000;
    DM.tokens.set(id, { id, sym: 'FAKE' + DM.n, px: 0.0001 + Math.random() * 0.01, liq, vol: liq * (0.4 + Math.random() * 4), t: now - (accel ? 4 + Math.random() * 60 : 20 + Math.random() * 600) * 60000, rug: Math.random() < 0.2, drift: (Math.random() - 0.55) * 0.012, hot: Math.random() < 0.15, creator: '', dev: 0, ins: 0 });
    const tk = DM.tokens.get(id); tk.creator = tk.rug ? 'CRERUG' + (1 + Math.floor(Math.random() * 4)) : 'CRE' + (1 + Math.floor(Math.random() * 40));
    tk.mint = Math.random() < (tk.rug ? 0.45 : 0.12); tk.freeze = Math.random() < (tk.rug ? 0.3 : 0.06); tk.lp = Math.random() < (tk.rug ? 0.35 : 0.8) ? 91 + Math.random() * 9 : Math.random() * 85; tk.risk = Math.round((tk.rug ? 25 : 8) + Math.random() * 45); tk.top10 = 8 + Math.random() * (tk.rug ? 50 : 30);
    const shady = Math.random() < 0.3; tk.dev = shady ? 12 + Math.random() * 33 : Math.random() * 9; tk.ins = Math.random() < 0.3 ? 26 + Math.random() * 20 : Math.random() * 22;
  }
  const out = new Map(), fresh = [];
  for (const t of DM.tokens.values()) {
    if (t.dead) { t.px *= 0.9; } else {
      t.px *= Math.exp(t.drift + (Math.random() - 0.5) * 0.045);
      if (t.rug && t.warn) { t.px *= 0.06; t.liq *= 0.05; t.dead = true; }
      else if (t.rug && Math.random() < 0.04) { t.warn = true; t.dev = 0; t.ins *= 0.3; }
    }
    if (accel) t.t -= 120000; if (now - t.t > 4 * 3600e3 && DM.tokens.size > 60) DM.tokens.delete(t.id);
    out.set(t.id, normPair({ baseToken: { address: t.id, symbol: t.sym }, priceUsd: String(t.px), liquidity: { usd: t.liq }, volume: { h1: t.vol }, priceChange: { h1: t.hot ? 140 : (Math.random() - 0.4) * 60 }, txns: { h1: { buys: 80 + Math.floor(Math.random() * 300), sells: 40 + Math.floor(Math.random() * 250) } }, fdv: t.liq * (4 + Math.random() * 20), pairCreatedAt: t.t }));
    if (!seenArr.includes(t.id)) fresh.push(t.id);
  }
  return { map: out, fresh };
}

const equityNow = () => SIM.cash + SIM.pos.reduce((a, p) => a + p.qty * p.last, 0);
const impact = (size, liq) => liq > 0 ? clamp(2 * size / liq * 100, 0, 60) : 60;
function scoreOf(p, s) {
  const liqS = clamp(Math.log10(Math.max(p.liq, 1) / s.minLiq) / 1.2, 0, 1);
  const act = clamp(p.vol1h / Math.max(p.liq, 1) / 3, 0, 1);
  const tot = p.buys + p.sells, bal = tot ? 1 - Math.abs(p.buys / tot - 0.55) * 2.2 : 0;
  const mom = clamp(1 - Math.abs(p.ch1h - 15) / 120, 0, 1);
  return +(0.35 * liqS + 0.25 * act + 0.2 * clamp(bal, 0, 1) + 0.2 * mom).toFixed(2);
}
function logIt(sym, msg, ok) { SIM.log.push({ t: Date.now(), sym, msg, ok: !!ok }); if (SIM.log.length > 300) SIM.log.shift(); }
function evaluate(p, s) {
  const ageMin = p.created ? (Date.now() - p.created) / 60000 : null;
  if (ageMin !== null && (ageMin < s.minAgeMin || ageMin > s.maxAgeH * 60)) return 'age';
  if (p.liq < s.minLiq) return 'liq';
  if (p.vol1h < s.minVol1h) return 'vol';
  if (p.ch1h > s.maxPump1h) return 'pump';
  if (p.ch1h < -40) return 'dump';
  if (p.buys + p.sells < s.minTx1h) return 'tx';
  if (p.buys >= 20 && p.sells === 0) return 'honey';
  if (p.fdv > 0 && p.fdv / Math.max(p.liq, 1) > s.maxFdvLiq) return 'fdv';
  return '';
}
function openPos(p, sc, s, pr) {
  const size = Math.min(equityNow() * s.stakePct / 100, SIM.cash);
  if (size < 1) return 'cash';
  const slip = s.slipPct + impact(size, p.liq), fee = size * s.feePct / 100, fill = p.px * (1 + slip / 100), qty = (size - fee) / fill;
  SIM.cash -= size;
  SIM.pos.push({ addr: p.addr, sym: p.sym, entry: fill, qty, cost: size, fee, peak: p.px, last: p.px, liq0: p.liq, liq: p.liq, at: Date.now(), score: sc, miss: 0, creator: pr ? pr.creator : '', dev0: pr && pr.dev !== null ? pr.dev : 0, ins0: pr && pr.ins !== null ? pr.ins : 0, rcAt: Date.now() });
  logIt(p.sym, `Achat simulé ${usd(size)} (score ${sc}, slippage ${slip.toFixed(1)} %)`, true);
  return '';
}
function closePos(p, reason, rug) {
  const s = SIM.settings; let out;
  if (rug) out = p.cost * 0.03;
  else { const val = p.qty * p.last, slip = s.slipPct + impact(val, p.liq); out = val * (1 - slip / 100) * (1 - s.feePct / 100); }
  SIM.cash += out;
  SIM.closed.push({ sym: p.sym, at: p.at, to: Date.now(), cost: p.cost, out, fees: p.fee + (rug ? 0 : p.qty * p.last * s.feePct / 100), reason, score: p.score });
  if (SIM.closed.length > 1000) SIM.closed.shift();
  SIM.pos = SIM.pos.filter(x => x !== p);
  if (rug && p.creator) addBlack(p.creator);
  logIt(p.sym, `Vente simulée : ${reason} (${pc((out / p.cost - 1) * 100)})`, out >= p.cost);
}
function managePositions(map) {
  const s = SIM.settings;
  for (const p of SIM.pos.slice()) {
    const q = map.get(p.addr);
    if (!q) { p.miss++; if (p.miss >= 8) closePos(p, 'Plus de données (rug probable)', true); continue; }
    p.miss = 0; p.last = q.px; p.liq = q.liq; if (q.px > p.peak) p.peak = q.px;
    if (p.liq < p.liq0 * 0.2 || q.px < p.entry * 0.1) { closePos(p, 'Rug : liquidité retirée', true); continue; }
    const up = (p.peak / p.entry - 1) * 100;
    if (q.px <= p.entry * (1 - s.stopPct / 100)) closePos(p, 'Stop-loss', false);
    else if (up >= s.trailAt && q.px <= p.peak * (1 - s.trailDist / 100)) closePos(p, 'Stop suiveur', false);
    else if (Date.now() - p.at > s.maxHoldH * 3600e3) closePos(p, 'Durée maximale', false);
  }
}
async function tick() {
  if (LU.busy || !SIM.running) return;
  LU.busy = true;
  SIM.settings.demo = !!S.settings.demo;
  const s = SIM.settings;
  try {
    const m = s.demo ? demoMarket() : await fetchMarket(SIM.pos.map(p => p.addr));
    LU.err = ''; LU.last = Date.now();
    managePositions(m.map);
    await checkInsiders();
    const seen = new Set(SIM.seen);
    let budget = s.rcOn ? (s.demo ? 99 : s.rcPerTick) : 0;
    for (const addr of m.fresh) {
      if (seen.has(addr)) continue;
      const p = m.map.get(addr); if (!p) continue;
      let why = evaluate(p, s), sc = 0, pr = null, detail = '';
      if (!why) { sc = scoreOf(p, s); if (sc < s.minScore) why = 'score'; }
      if (!why && SIM.pos.length >= s.maxPos) why = 'full';
      if (!why && s.rcOn) { if (budget <= 0) continue; budget--; const r = await rcCheck(p, s); why = r.why; detail = r.detail; pr = r.pr; }
      seen.add(addr); SIM.seen.push(addr); SIM.scanned++;
      if (!why) why = openPos(p, sc, s, pr);
      if (why) { SIM.rej[why] = (SIM.rej[why] || 0) + 1; logIt(p.sym, 'Refusé : ' + RULES[why] + (detail ? ' (' + detail + ')' : ''), false); } else SIM.passed++;
    }
    if (SIM.seen.length > 3000) SIM.seen = SIM.seen.slice(-3000);
    const last = SIM.equity[SIM.equity.length - 1];
    if (!last || Date.now() - last[0] > (s.demo ? 3000 : 25000)) { SIM.equity.push([Date.now(), equityNow()]); if (SIM.equity.length > 600) SIM.equity.shift(); }
    lsave();
  } catch (e) { LU.err = errMsg(e); }
  LU.busy = false; lrender();
}
let timer = 0;
function schedule() { clearTimeout(timer); if (!SIM.running) return; timer = setTimeout(async () => { timer = 0; await tick(); schedule(); }, SIM.settings.demo ? 2000 : SIM.settings.pollSec * 1000); }
function setRunning(v) {
  SIM.running = v; if (v && !SIM.startedAt) { SIM.startedAt = Date.now(); SIM.equity.push([Date.now(), equityNow()]); }
  lsave(); lrender(); if (v) { tick().then(schedule); } else clearTimeout(timer);
}

/* ---------- Statistiques ---------- */
function stats() {
  const c = SIM.closed, pnl = c.map(t => t.out - t.cost), wins = pnl.filter(x => x > 0), losses = pnl.filter(x => x <= 0);
  const gw = wins.reduce((a, b) => a + b, 0), gl = -losses.reduce((a, b) => a + b, 0);
  let peak = -Infinity, dd = 0; for (const [, v] of SIM.equity) { if (v > peak) peak = v; dd = Math.max(dd, peak > 0 ? (peak - v) / peak * 100 : 0); }
  const eq = equityNow();
  return { eq, total: eq - SIM.settings.balance0, totalPct: (eq / SIM.settings.balance0 - 1) * 100, n: c.length, wr: c.length ? wins.length / c.length * 100 : null, pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : null),
    avgW: wins.length ? gw / wins.length : null, avgL: losses.length ? -gl / losses.length : null, dd, fees: c.reduce((a, t) => a + t.fees, 0), rugs: c.filter(t => /Rug|Plus de/.test(t.reason)).length, best: pnl.length ? Math.max(...pnl) : 0 };
}

function curveSVG() {
  const e = SIM.equity; if (e.length < 2) return '<div class="empty">La courbe apparaîtra après quelques scans.</div>';
  const W = 600, H = 190, vs = e.map(x => x[1]), lo = Math.min(...vs, SIM.settings.balance0), hi = Math.max(...vs, SIM.settings.balance0), sp = hi - lo || 1;
  const pts = e.map((x, i) => `${(i / (e.length - 1) * W).toFixed(1)},${(H - 8 - (x[1] - lo) / sp * (H - 16)).toFixed(1)}`).join(' ');
  const y0 = (H - 8 - (SIM.settings.balance0 - lo) / sp * (H - 16)).toFixed(1), up = vs[vs.length - 1] >= SIM.settings.balance0;
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Courbe du capital simulé"><line x1="0" x2="${W}" y1="${y0}" y2="${y0}" stroke="#243044" stroke-dasharray="4 4"/><polyline fill="none" stroke="${up ? '#34d399' : '#f87171'}" stroke-width="2.5" vector-effect="non-scaling-stroke" points="${pts}"/></svg><div class="small mut">De ${usd(lo)} à ${usd(hi)} · ligne pointillée = capital de départ</div>`;
}
function funnelHTML() {
  const total = SIM.scanned; if (!total) return '<div class="empty">Aucun token analysé pour l’instant.</div>';
  const rows = Object.keys(RULES).map(k => [k, SIM.rej[k] || 0]).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]);
  return `<div class="fun"><b>${total.toLocaleString('fr-FR')} analysés</b><span></span><div class="bar"><i style="width:100%"></i></div>` +
    rows.map(([k, n]) => `<span>${esc(RULES[k])}</span><span class="mut">${n.toLocaleString('fr-FR')}</span><div class="bar"><i style="width:${(n / total * 100).toFixed(1)}%"></i></div>`).join('') +
    `<b class="pos">${SIM.passed} achetés</b><span class="mut">${(SIM.passed / total * 100).toFixed(1).replace('.', ',')} %</span></div>`;
}
function verdictHTML(st) {
  const p = [];
  if (st.n < 30) p.push(`<b>Trop tôt pour conclure.</b> ${st.n} trade${st.n > 1 ? 's' : ''} clôturé${st.n > 1 ? 's' : ''} : avec moins de 30, un bon ou un mauvais résultat peut être du pur hasard. Vise 100 trades sur au moins deux semaines.`);
  else if (st.total > 0) p.push(`<b>Résultat positif en simulation (${pc(st.totalPct)}).</b> Ce n’est pas une preuve : vérifie qu’il tient sur plusieurs semaines et que les gains ne viennent pas d’un ou deux trades chanceux (meilleur trade : ${usd(st.best)}).`);
  else p.push(`<b>Résultat négatif en simulation (${pc(st.totalPct)}).</b> La stratégie telle que réglée perd de l’argent, même avec des ordres supposés parfaits.`);
  p.push('Cette simulation est <b>plus favorable que la réalité</b> : elle ne voit ni les wallets, ni les achats groupés, ni les tokens impossibles à revendre, et suppose que tes ordres passent au prix prévu.');
  if (SIM.settings.rcOn) p.push('Les contrôles du créateur et des « initiés » (assimilés aux achats groupés) viennent de RugCheck : ce sont des approximations, parfois en retard, et un token très récent peut ne pas être encore analysé.');
  if (st.rugs) p.push(`${st.rugs} position${st.rugs > 1 ? 's' : ''} terminée${st.rugs > 1 ? 's' : ''} en rug (quasi perte totale) : c’est la fréquence à garder en tête.`);
  return `<h2>Lecture honnête</h2>` + p.map(x => `<p class="small">${x}</p>`).join('');
}
'use strict';
/* Backtest et optimisation sur des dizaines de cryptos : données publiques Binance (bougies),
   règles testées sur les 70 % les plus anciens (entraînement), puis vérifiées sur les 30 % récents
   que l'optimisation n'a jamais vus (validation). Aucun ordre réel. */
const BT_COINS = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'LINK', 'DOT', 'LTC', 'TRX', 'ATOM', 'NEAR', 'UNI', 'AAVE', 'ETC', 'FIL', 'ARB', 'OP'];
const BT_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
const BT_IV = { '1h': ['1 heure', 1000, 8760], '4h': ['4 heures', 1000, 2190], '1d': ['1 jour', 1000, 365] };
const btSave = () => lsave();
const nextTick = () => new Promise(r => setTimeout(r, 0));

async function btFetchCoin(sym, iv) {
  if (S.settings.demo) return synthKlines(sym, iv);
  let last;
  for (const h of BT_HOSTS) {
    try {
      const j = await getJSON(`${h}/api/v3/klines?symbol=${sym}USDT&interval=${iv}&limit=${BT_IV[iv][1]}`);
      if (!Array.isArray(j) || j.length < 300) throw new Error('badjson');
      const n = j.length, o = new Float64Array(n), hi = new Float64Array(n), lo = new Float64Array(n), c = new Float64Array(n), t = new Float64Array(n);
      for (let i = 0; i < n; i++) { const k = j[i]; t[i] = +k[0]; o[i] = +k[1]; hi[i] = +k[2]; lo[i] = +k[3]; c[i] = +k[4]; }
      if (![...c].every(x => x > 0)) throw new Error('badjson');
      return { o, h: hi, l: lo, c, t };
    } catch (e) { last = e; if (e.message === 'offline') break; }
  }
  throw last;
}
async function btLoad() {
  const need = BTS.coins.filter(c => !(BTS.data[BTS.iv] && BTS.data[BTS.iv][c])); BTS.data[BTS.iv] ||= {};
  let done = 0, fail = [];
  const q = need.slice();
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (q.length) { const s = q.shift(); try { BTS.data[BTS.iv][s] = await btFetchCoin(s, BTS.iv); } catch (e) { fail.push(s + ' (' + errMsg(e) + ')'); } done++; BTS.prog = done / Math.max(need.length, 1) * 0.3; btRender(); }
  }));
  return fail;
}

/* Indicateurs (causaux : la valeur à la barre i n'utilise que les barres ≤ i) */
function ind(d, kind, p) {
  const n = d.c.length, en = new Uint8Array(n), ex = new Uint8Array(n);
  if (kind === 'donchian') {
    for (let i = Math.max(p.n, p.m); i < n; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let k = i - p.n; k < i; k++) if (d.h[k] > hh) hh = d.h[k];
      for (let k = i - p.m; k < i; k++) if (d.l[k] < ll) ll = d.l[k];
      en[i] = d.c[i] > hh ? 1 : 0; ex[i] = d.c[i] < ll ? 1 : 0;
    }
  } else if (kind === 'rsi') {
    let ag = 0, al = 0; const P = 14;
    for (let i = 1; i < n; i++) {
      const ch = d.c[i] - d.c[i - 1], g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
      if (i <= P) { ag += g / P; al += l / P; } else { ag = (ag * (P - 1) + g) / P; al = (al * (P - 1) + l) / P; }
      if (i >= P) { const r = al === 0 ? 100 : 100 - 100 / (1 + ag / al); en[i] = r < p.e ? 1 : 0; ex[i] = r > p.x ? 1 : 0; }
    }
  } else {
    const sma = L => { const o = new Float64Array(n); let s = 0; for (let i = 0; i < n; i++) { s += d.c[i]; if (i >= L) s -= d.c[i - L]; o[i] = i >= L - 1 ? s / L : NaN; } return o; };
    const f = sma(p.f), s = sma(p.s);
    for (let i = p.s; i < n; i++) { en[i] = f[i] > s[i] ? 1 : 0; ex[i] = f[i] < s[i] ? 1 : 0; }
  }
  return { en, ex };
}
/* Simulation d'une pièce sur [from, to) : signal à la clôture, exécution à l'ouverture suivante */
function simCoin(d, sg, p, from, to, fee, slip) {
  const f = fee / 100, s = slip / 100, eq = new Float64Array(to - from);
  let cash = 1, qty = 0, cost = 0, fillPx = 0, bars = 0, trades = 0, wins = 0, gw = 0, gl = 0, fees = 0;
  const close = px => { const gross = qty * px * (1 - s), v = gross * (1 - f); fees += gross * f; if (v > cost) { wins++; gw += v - cost; } else gl += cost - v; trades++; cash = v; qty = 0; };
  for (let i = from; i < to; i++) {
    if (qty > 0) { bars++; if (sg.ex[i - 1] || (p.hold && bars > p.hold)) close(d.o[i]); }
    if (qty === 0 && i > from && sg.en[i - 1]) { cost = cash; fillPx = d.o[i] * (1 + s); fees += cash * f; qty = cash * (1 - f) / fillPx; cash = 0; bars = 0; }
    if (qty > 0 && p.stop) { const stp = fillPx * (1 - p.stop / 100); if (d.l[i] <= stp) close(Math.min(d.o[i], stp)); }
    eq[i - from] = cash + qty * d.c[i];
  }
  return { eq, trades, wins, gw, gl, fees };
}
function holdCoin(d, from, to, fee, slip) {
  const k = (1 - fee / 100) / (1 + slip / 100) / d.o[from], eq = new Float64Array(to - from);
  for (let i = from; i < to; i++) eq[i - from] = k * d.c[i];
  return eq;
}
function maxDD(eq) { let pk = -Infinity, dd = 0; for (const v of eq) { if (v > pk) pk = v; const x = (pk - v) / pk; if (x > dd) dd = x; } return dd * 100; }
function portfolio(parts) {
  const L = parts[0].length, out = new Float64Array(L);
  for (const a of parts) for (let i = 0; i < L; i++) out[i] += a[i] / parts.length;
  return out;
}
function summarize(sims) {
  const eq = portfolio(sims.map(x => x.eq)), t = sims.reduce((a, x) => a + x.trades, 0), w = sims.reduce((a, x) => a + x.wins, 0);
  const gw = sims.reduce((a, x) => a + x.gw, 0), gl = sims.reduce((a, x) => a + x.gl, 0);
  return { eq, ret: (eq[eq.length - 1] - 1) * 100, dd: maxDD(eq), trades: t, wr: t ? w / t * 100 : null, pf: gl > 0 ? gw / gl : (gw > 0 ? 99 : null), fees: sims.reduce((a, x) => a + x.fees, 0) / sims.length * 100 };
}
const GRID = {
  donchian: () => { const o = []; for (const n of [10, 20, 40, 80]) for (const m of [5, 10, 20]) for (const stop of [0, 5, 10]) o.push({ ik: `${n}-${m}`, ip: { n, m }, p: { stop }, label: `Cassure ${n} / sortie ${m}${stop ? ', stop ' + stop + ' %' : ''}` }); return o; },
  rsi: () => { const o = []; for (const e of [20, 25, 30, 35]) for (const x of [50, 60, 70]) for (const stop of [0, 5, 10]) for (const hold of [24, 72]) o.push({ ik: `${e}-${x}`, ip: { e, x }, p: { stop, hold }, label: `Rebond RSI<${e}, sortie RSI>${x}${stop ? ', stop ' + stop + ' %' : ''}, max ${hold} barres` }); return o; },
  sma: () => { const o = []; for (const f of [5, 10, 20]) for (const s of [30, 50, 100, 200]) for (const stop of [0, 10]) o.push({ ik: `${f}-${s}`, ip: { f, s }, p: { stop }, label: `Moyennes ${f}/${s}${stop ? ', stop ' + stop + ' %' : ''}` }); return o; },
};
const STRAT_NAME = { donchian: 'Tendance (cassure)', rsi: 'Rebond (survente)', sma: 'Croisement de moyennes' };
const medianOf = a => { const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length ? (b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2) : 0; };

async function btRun() {
  if (BTS.busy) return;
  BTS.busy = true; BTS.err = ''; BTS.res = null; BTS.sel = 0; BTS.prog = 0; btRender();
  try {
    if (BTS.coins.length < 3) throw new Error('Choisis au moins 3 cryptos.');
    const fail = await btLoad();
    const coins = BTS.coins.filter(c => BTS.data[BTS.iv][c]);
    if (coins.length < 3) throw new Error('Données indisponibles : ' + (fail[0] || 'aucune réponse') + '. Si tu es dans un pays où Binance est bloqué, ce test ne peut pas tourner.');
    const n = Math.min(...coins.map(c => BTS.data[BTS.iv][c].c.length));
    const D = {}; for (const c of coins) { const d = BTS.data[BTS.iv][c], o = d.c.length - n; D[c] = { o: d.o.subarray(o), h: d.h.subarray(o), l: d.l.subarray(o), c: d.c.subarray(o), t: d.t.subarray(o) }; }
    const warm = 200, split = Math.floor(n * 0.7), kinds = BTS.strat === 'all' ? ['donchian', 'rsi', 'sma'] : [BTS.strat];
    const all = []; let step = 0; const total = kinds.reduce((a, k) => a + GRID[k]().length, 0);
    for (const kind of kinds) {
      const combos = GRID[kind](), cache = {};
      for (const cb of combos) {
        if (!cache[cb.ik]) { cache[cb.ik] = {}; for (const c of coins) cache[cb.ik][c] = ind(D[c], kind, cb.ip); }
        const tr = summarize(coins.map(c => simCoin(D[c], cache[cb.ik][c], cb.p, warm, split, BTS.fee, BTS.slip)));
        const te = summarize(coins.map(c => simCoin(D[c], cache[cb.ik][c], cb.p, split, n, BTS.fee, BTS.slip)));
        all.push({ kind, cb, tr, te: { ...te, eq: null }, teEq: te.eq, score: tr.trades >= coins.length * 2 ? tr.ret / (tr.dd + 5) : -Infinity });
        if (++step % 6 === 0) { BTS.prog = 0.3 + 0.7 * step / total; btProgress(); await nextTick(); }
      }
    }
    const bhTr = portfolio(coins.map(c => holdCoin(D[c], warm, split, BTS.fee, BTS.slip))), bhTe = portfolio(coins.map(c => holdCoin(D[c], split, n, BTS.fee, BTS.slip)));
    const per = {}; for (const k of kinds) { const a = all.filter(x => x.kind === k); per[k] = { n: a.length, posShare: a.filter(x => x.te.ret > 0).length / a.length * 100, med: medianOf(a.map(x => x.te.ret)), beat: a.filter(x => x.te.ret > (bhTe[bhTe.length - 1] - 1) * 100).length / a.length * 100 }; }
    const top = []; for (const k of kinds) all.filter(x => x.kind === k && x.score > -Infinity).sort((a, b) => b.score - a.score).slice(0, 3).forEach(x => top.push(x));
    top.sort((a, b) => b.score - a.score);
    const barMs = D[coins[0]].t[1] - D[coins[0]].t[0], days = x => Math.round(x * barMs / 864e5);
    BTS.res = { coins, fail, n, warm, split, kinds, top, per, bh: { tr: (bhTr[bhTr.length - 1] - 1) * 100, te: (bhTe[bhTe.length - 1] - 1) * 100, trDD: maxDD(bhTr), teDD: maxDD(bhTe), eq: bhTe }, trDays: days(split - warm), teDays: days(n - split), combos: all.length, D };
  } catch (e) { BTS.err = e.message || 'Erreur inconnue'; }
  BTS.busy = false; btRender();
}
/* Détail d'une combinaison : par pièce, sur la période de validation, et avec des frais doublés */
function btDetail(x) {
  const R = BTS.res, d = {}; let rows = [], sims = [], sims2 = [];
  for (const c of R.coins) {
    const sg = ind(R.D[c], x.kind, x.cb.ip), s1 = simCoin(R.D[c], sg, x.cb.p, R.split, R.n, BTS.fee, BTS.slip), s2 = simCoin(R.D[c], sg, x.cb.p, R.split, R.n, BTS.fee * 2, BTS.slip * 2);
    sims.push(s1); sims2.push(s2);
    rows.push({ c, ret: (s1.eq[s1.eq.length - 1] - 1) * 100, bh: (R.D[c].c[R.n - 1] / R.D[c].o[R.split] - 1) * 100, trades: s1.trades });
  }
  d.rows = rows.sort((a, b) => b.ret - a.ret); d.double = summarize(sims2).ret; return d;
}
function curveBT(a, b) {
  const W = 600, H = 190, all = [...a, ...b], lo = Math.min(...all), hi = Math.max(...all), sp = hi - lo || 1, L = a.length;
  const pl = s => Array.from(s, (v, i) => `${(i / (L - 1) * W).toFixed(1)},${(H - 8 - (v - lo) / sp * (H - 16)).toFixed(1)}`).join(' ');
  const y1 = (H - 8 - (1 - lo) / sp * (H - 16)).toFixed(1);
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Stratégie contre garder les cryptos, période de validation"><line x1="0" x2="${W}" y1="${y1}" y2="${y1}" stroke="#243044" stroke-dasharray="4 4"/><polyline fill="none" stroke="#60a5fa" stroke-width="2" vector-effect="non-scaling-stroke" points="${pl(b)}"/><polyline fill="none" stroke="#34d399" stroke-width="2.5" vector-effect="non-scaling-stroke" points="${pl(a)}"/></svg><div class="small"><span class="pos">● Stratégie</span> &nbsp; <span style="color:#60a5fa">● Garder les cryptos (acheter et ne rien faire)</span></div>`;
}
function btVerdict(R, x, det) {
  const p = [], te = x.te.ret, bh = R.bh.te, per = R.per[x.kind];
  if (te <= 0) p.push(`<b>Hors échantillon, la règle choisie perd de l’argent (${pc(te)}).</b> Elle semblait bonne sur le passé, mais pas sur la période qu’elle n’avait jamais vue : c’est le signe classique d’un réglage trop collé au passé.`);
  else if (te <= bh) p.push(`<b>Elle gagne (${pc(te)}) mais fait moins bien que garder simplement les cryptos (${pc(bh)}).</b> Dans ce cas, la stratégie ajoute des frais et de la complexité sans rien apporter${x.te.dd < R.bh.teDD ? ', sauf une baisse maximale plus faible (' + x.te.dd.toFixed(0) + ' % contre ' + R.bh.teDD.toFixed(0) + ' %)' : ''}.`);
  else p.push(`<b>Elle bat le simple fait de garder (${pc(te)} contre ${pc(bh)}) sur la période de validation.</b> C’est encourageant, mais ce n’est pas une preuve : ${R.teDays} jours de validation, c’est une seule « météo » de marché.`);
  p.push(`Sur les ${per.n} réglages testés pour cette famille, ${Math.round(per.posShare)} % sont positifs en validation et ${Math.round(per.beat)} % battent « garder ». Si ce chiffre est bas, trouver un bon réglage relève surtout de la chance.`);
  p.push(`Avec des frais et un slippage doublés, la même règle donne ${pc(det.double)}.`);
  p.push(`Biais connus : ces cryptos sont celles qui ont survécu jusqu’à aujourd’hui (ça flatte « garder » et les stratégies de tendance), et la période testée ne représente qu’un type de marché.`);
  return p.map(t => `<p class="small">${t}</p>`).join('');
}
function btProgress() { const e = $('#bt-prog i'); if (e) e.style.width = (BTS.prog * 100).toFixed(0) + '%'; }
function btRender() {
  const el = $('#lab-bt'); if (!el) return;
  const R = BTS.res, dis = BTS.busy ? 'disabled' : '';
  let h = `<div class="panel"><h2>Tester sur plusieurs cryptos</h2>
    <p class="small mut">Télécharge l’historique public Binance, teste des dizaines de réglages sur le passé ancien, puis vérifie le meilleur sur les ${'30'} % les plus récents que l’optimisation n’a jamais vus. Sans cette vérification, n’importe quel réglage a l’air génial.</p>
    <div class="fgrid"><label>Durée d’une bougie<select id="bt-iv" ${dis}>${Object.keys(BT_IV).map(k => `<option value="${k}" ${k === BTS.iv ? 'selected' : ''}>${BT_IV[k][0]}</option>`).join('')}</select></label>
    <label>Famille de règles<select id="bt-strat" ${dis}><option value="all" ${BTS.strat === 'all' ? 'selected' : ''}>Toutes (3 familles)</option>${Object.keys(STRAT_NAME).map(k => `<option value="${k}" ${k === BTS.strat ? 'selected' : ''}>${STRAT_NAME[k]}</option>`).join('')}</select></label>
    <label>Frais par ordre (%)<input id="bt-fee" inputmode="decimal" value="${String(BTS.fee).replace('.', ',')}" ${dis}><span class="h">Binance : 0,1 en général</span></label>
    <label>Slippage par ordre (%)<input id="bt-slip" inputmode="decimal" value="${String(BTS.slip).replace('.', ',')}" ${dis}></label></div>
    <div class="coinchips" role="group" aria-label="Cryptos testées">${BT_COINS.map(c => `<button class="chip" data-act="btcoin" data-c="${c}" aria-pressed="${BTS.coins.includes(c)}" ${dis}>${c}</button>`).join('')}</div>
    <div class="lbtns"><button class="btn primary" data-act="btrun" ${dis}>${BTS.busy ? 'Calcul en cours…' : 'Lancer le test'}</button><button class="btn" data-act="btall" ${dis}>Tout cocher</button></div>
    ${BTS.busy ? '<div class="bar" id="bt-prog" style="margin-top:10px"><i style="width:' + (BTS.prog * 100).toFixed(0) + '%"></i></div>' : ''}</div>`;
  if (BTS.err) h += `<div class="banner" role="alert">${esc(BTS.err)}</div>`;
  if (R && !BTS.busy) {
    const x = R.top[BTS.sel] || R.top[0];
    if (!x) h += '<div class="banner">Aucun réglage n’a produit assez de trades pour être évalué. Essaie des bougies plus courtes ou plus de cryptos.</div>';
    else {
      const det = btDetail(x);
      h += `<div class="kpis">${kpiHTML('Réglage choisi (entraînement)', pc(x.tr.ret), `${R.trDays} j · baisse max ${x.tr.dd.toFixed(0)} %`, x.tr.ret >= 0 ? 'pos' : 'neg')}${kpiHTML('Même réglage, période inconnue', pc(x.te.ret), `${R.teDays} j · baisse max ${x.te.dd.toFixed(0)} %`, x.te.ret >= 0 ? 'pos' : 'neg')}${kpiHTML('Garder les cryptos, même période', pc(R.bh.te), `baisse max ${R.bh.teDD.toFixed(0)} %`, R.bh.te >= 0 ? 'pos' : 'neg')}${kpiHTML('Trades en validation', String(x.te.trades), x.te.wr === null ? '—' : `${Math.round(x.te.wr)} % gagnants · frais ${x.te.fees.toFixed(1).replace('.', ',')} % du capital`)}</div>
      <div class="panel verdict"><h2>Lecture honnête</h2>${btVerdict(R, x, det)}</div>
      <div class="grid2"><div class="panel"><h2>Période de validation</h2>${curveBT(x.teEq, R.bh.eq)}</div>
      <div class="panel"><h2>Par crypto (validation)</h2>${det.rows.map(r => `<div class="lrow"><div class="t">${esc(r.c)}</div><div class="n ${r.ret >= 0 ? 'pos' : 'neg'}">${pc(r.ret)}</div><div class="m">Garder : ${pc(r.bh)} · ${r.trades} trade${r.trades > 1 ? 's' : ''}</div></div>`).join('')}</div></div>
      <div class="panel"><h2>Meilleurs réglages (choisis sur l’entraînement)</h2><p class="small mut">Touche une ligne pour voir le détail. La colonne qui compte est la validation.</p>
      ${R.top.map((t, i) => `<button class="lrow selrow" data-act="btsel" data-i="${i}" aria-pressed="${t === x}"><div class="t">${esc(STRAT_NAME[t.kind])} · ${esc(t.cb.label)}</div><div class="n ${t.te.ret >= 0 ? 'pos' : 'neg'}">${pc(t.te.ret)}</div><div class="m">Entraînement ${pc(t.tr.ret)} → validation ${pc(t.te.ret)} · ${t.te.trades} trades</div></button>`).join('')}</div>
      <div class="panel"><h2>Robustesse par famille</h2>${R.kinds.map(k => `<div class="lrow"><div class="t">${esc(STRAT_NAME[k])}</div><div class="n">${Math.round(R.per[k].posShare)} % positifs</div><div class="m">${R.per[k].n} réglages · médiane en validation ${pc(R.per[k].med)} · ${Math.round(R.per[k].beat)} % battent « garder »</div></div>`).join('')}
      <p class="small mut">${R.coins.length} cryptos · ${R.combos} réglages · ${R.n} bougies. ${R.fail.length ? 'Indisponibles : ' + esc(R.fail.join(', ')) + '.' : ''}</p></div>`;
    }
  }
  el.innerHTML = h;
}

/* ---------- Données fictives pour le backtest (mode démo) ---------- */
function synthKlines(sym, iv) {
  let seed = 0; for (const ch of sym) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const n = 1000, ms = iv === '1h' ? 3600e3 : iv === '4h' ? 14400e3 : 86400e3, t0 = Date.now() - n * ms;
  const o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n), c = new Float64Array(n), t = new Float64Array(n);
  let px = 100; const vol = 0.012 + rnd() * 0.02, drift = (rnd() - 0.45) * 0.0008;
  for (let i = 0; i < n; i++) { const op = px, cl = op * Math.exp(drift + gauss() * vol); o[i] = op; c[i] = cl; h[i] = Math.max(op, cl) * (1 + Math.abs(gauss()) * vol / 3); l[i] = Math.min(op, cl) * (1 - Math.abs(gauss()) * vol / 3); t[i] = t0 + i * ms; px = cl; }
  return { o, h, l, c, t };
}

/* ======================= ARÈNE (v5) =======================
   Plusieurs stratégies de memecoins tournent en parallèle sur exactement les mêmes tokens, chacune avec son propre capital fictif.
   Un « témoin » sans filtre sert de point de comparaison, et chaque token négociable est aussi suivi en fantôme (sortie standard identique)
   pour mesurer si un filtre protège vraiment. Tout est simulé : aucun ordre réel, aucune clé de portefeuille. */
const EVAL_AGE = 30, GAP_MS = typeof ARENA_GAP_MS === 'number' ? ARENA_GAP_MS : 600000, SH_SIZE = 50, CLOSED_MAX = 500, SH_MAX = 1500, SH_OPEN_MAX = 150, WAIT_MAX = 60, EXIT_DEV = 20, EXIT_INS = 25;
const SH_X = { stop: 25, trailAt: 30, trailDist: 15, maxHoldH: 6 };
const F_ = o => ({ maxAgeH: 72, minLiq: 10000, minVol1h: 0, maxPump1h: 0, noDump: false, minTx1h: 0, maxFdvLiq: 0, minScore: 0, share: 0, rc: false, black: false, rugged: false, mint: false, freeze: false, danger: false, risk: null, lp: null, top10: null, dev: null, insN: null, insPct: null, serial: 0, ...o });
const X_ = o => ({ stop: 6, ladder: [], trailAt: 12, trailDist: 6, trailAfterTake: false, maxHoldH: 6, holdMinPct: null, liqDrop: 0, rcExit: false, ...o });
const STRATS = [
  { id: 'guide', name: 'Guide strict', color: '#34d399', short: 'G',
    desc: 'Les règles du guide : autorités mint et freeze fermées, liquidité verrouillée à 90 % ou plus, top 10 des détenteurs sous 30 %, créateur sous 5 %, aucun initié, score de risque RugCheck sous 40, pool d’au moins 30 000 $, ta mise sous 1 % du pool. Sorties : stop −35 %, vend la moitié à +100 % et un quart à +200 %, stop suiveur de 30 % après la première vente, sortie si pas +20 % après 6 h ou si la liquidité baisse de 40 %.',
    f: F_({ minLiq: 30000, share: 1, rc: true, black: true, rugged: true, mint: true, freeze: true, danger: true, risk: 40, lp: 90, top10: 30, dev: 5, insN: 0 }),
    x: X_({ stop: 35, ladder: [[100, 0.5], [200, 0.25]], trailDist: 30, trailAfterTake: true, holdMinPct: 20, liqDrop: 40, rcExit: true }) },
  { id: 'ours', name: 'Notre filtre', color: '#60a5fa', short: 'N',
    desc: 'Le simulateur de la version 4 : créateur sous 10 %, initiés sous 25 %, pas de rug passé, pool d’au moins 25 000 $, volume, activité, valorisation et score minimum. Sorties : stop −6 %, stop suiveur (+12 % puis 6 %), 6 h maximum, sortie si le créateur ou les initiés vendent.',
    f: F_({ maxAgeH: 24, minLiq: 25000, minVol1h: 50000, maxPump1h: 100, noDump: true, minTx1h: 50, maxFdvLiq: 40, minScore: 0.6, rc: true, black: true, rugged: true, danger: true, dev: 10, insPct: 25, serial: 3 }),
    x: X_({ rcExit: true }) },
  { id: 'light', name: 'Filtre léger', color: '#fbbf24', short: 'L',
    desc: 'Seulement les évidences : pas déjà rugué, créateur hors liste noire, autorités mint et freeze fermées, pool d’au moins 15 000 $. Mêmes sorties que « Notre filtre ». Sert à savoir si les contrôles avancés des deux autres apportent quelque chose en plus.',
    f: F_({ minLiq: 15000, rc: true, black: true, rugged: true, mint: true, freeze: true }), x: X_() },
  { id: 'base', name: 'Témoin', color: '#c4b5fd', short: 'T',
    desc: 'Achète tout token négociable (pool d’au moins 10 000 $, avec des ventes), sans aucun filtre de sécurité. C’est le point de comparaison : une stratégie qui ne le bat pas nettement n’apporte rien.',
    f: F_({}), x: X_() },
];
const ADEF = { balance0: 1000, stakePct: 5, maxPos: 5, slipPct: 1.5, feePct: 1, pollSec: 30, rcPerTick: 4 };
const ALIM = { balance0: [10, 1e7], stakePct: [0.5, 25], maxPos: [1, 20], slipPct: [0, 20], feePct: [0, 10], pollSec: [10, 300], rcPerTick: [1, 15] };
const ALABEL = { balance0: ['Capital de départ par stratégie ($)', 'Fictif'], stakePct: ['Mise par trade (% du capital)', 'Maximum 25'], maxPos: ['Positions simultanées max (par stratégie)', ''],
  slipPct: ['Slippage de base (%)', 'Réaliste : 1 à 3'], feePct: ['Frais par ordre (%)', 'Réaliste : 0,5 à 1'], pollSec: ['Fréquence de scan (s)', 'Ne pas descendre sous 15'], rcPerTick: ['Analyses RugCheck max par scan', 'Limite les appels'] };
const stFresh = cash => ({ cash, pos: [], closed: [], equity: [], rej: {}, decided: 0, bought: 0 });
const arFresh = () => ({ settings: { ...ADEF, demo: false, wake: false }, running: false, st: Object.fromEntries(STRATS.map(d => [d.id, stFresh(ADEF.balance0)])), black: [], wait: [], seen: [], log: [], sh: { open: [], closed: [] }, scanned: 0, untrad: 0, gaps: 0, startedAt: 0, lastTick: 0 });
const arPos = p => p && typeof p === 'object' ? ({
  addr: str(p.addr, 80), sym: str(p.sym, 24) || '?', entry: numv(p.entry, 0, [0, 1e12]), qty: numv(p.qty, 0, [0, 1e30]), qty0: numv(p.qty0, 0, [0, 1e30]), cost: numv(p.cost, 0, [0, 1e12]), out: numv(p.out, 0, [0, 1e12]), fees: numv(p.fees, 0, [0, 1e9]),
  peak: numv(p.peak, 0, [0, 1e12]), last: numv(p.last, 0, [0, 1e12]), liq0: numv(p.liq0, 0, [0, 1e12]), liq: numv(p.liq, 0, [0, 1e12]), at: numv(p.at, 0, [0, 4e12]), steps: numv(p.steps, 0, [0, 10]), score: numv(p.score, 0, [0, 1]), miss: numv(p.miss, 0, [0, 1000]),
  creator: str(p.creator, 80), dev0: numv(p.dev0, 0, [0, 100]), ins0: numv(p.ins0, 0, [0, 100]), rcAt: numv(p.rcAt, 0, [0, 4e12]), gap: p.gap === 1 ? 1 : 0 }) : null;
function arenaClean(d) {
  const b = arFresh(); if (!d || typeof d !== 'object') return b;
  const r = d.settings && typeof d.settings === 'object' ? d.settings : {};
  b.settings = { demo: r.demo === true, wake: r.wake === true }; for (const k in ALIM) b.settings[k] = numv(r[k], ADEF[k], ALIM[k]);
  b.running = d.running === true;
  const src = d.st && typeof d.st === 'object' ? d.st : {};
  for (const def of STRATS) {
    const e = src[def.id], o = stFresh(b.settings.balance0); if (e && typeof e === 'object') {
      o.cash = numv(e.cash, b.settings.balance0, [-1e9, 1e12]);
      o.pos = (Array.isArray(e.pos) ? e.pos : []).slice(0, 50).map(arPos).filter(p => p && p.addr && p.entry > 0 && p.qty > 0 && p.qty0 > 0);
      o.closed = (Array.isArray(e.closed) ? e.closed : []).slice(-CLOSED_MAX).map(t => t && typeof t === 'object' ? ({ sym: str(t.sym, 24) || '?', at: numv(t.at, 0, [0, 4e12]), to: numv(t.to, 0, [0, 4e12]), cost: numv(t.cost, 0, [0, 1e12]), out: numv(t.out, 0, [0, 1e12]), fees: numv(t.fees, 0, [0, 1e9]), reason: str(t.reason, 60), inv: t.inv === 1 ? 1 : 0 }) : null).filter(t => t && t.cost > 0);
      o.equity = (Array.isArray(e.equity) ? e.equity : []).slice(-400).filter(q => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])).map(q => [q[0], q[1]]);
      if (e.rej && typeof e.rej === 'object') for (const k in RULES) o.rej[k] = numv(e.rej[k], 0, [0, 1e9]);
      o.decided = numv(e.decided, 0, [0, 1e9]); o.bought = numv(e.bought, 0, [0, 1e9]);
    }
    b.st[def.id] = o;
  }
  const vOk = v => typeof v === 'string' && v.length === STRATS.length && /^[01]+$/.test(v);
  const sh = d.sh && typeof d.sh === 'object' ? d.sh : {};
  b.sh.open = (Array.isArray(sh.open) ? sh.open : []).slice(0, SH_OPEN_MAX).map(h => h && typeof h === 'object' && vOk(h.v) ? ({ addr: str(h.addr, 80), sym: str(h.sym, 24) || '?', entry: numv(h.entry, 0, [0, 1e12]), qty: numv(h.qty, 0, [0, 1e30]), peak: numv(h.peak, 0, [0, 1e12]), last: numv(h.last, 0, [0, 1e12]), liq0: numv(h.liq0, 0, [0, 1e12]), liq: numv(h.liq, 0, [0, 1e12]), at: numv(h.at, 0, [0, 4e12]), miss: numv(h.miss, 0, [0, 1000]), v: h.v, gap: h.gap === 1 ? 1 : 0 }) : null).filter(h => h && h.addr && h.entry > 0 && h.qty > 0);
  b.sh.closed = (Array.isArray(sh.closed) ? sh.closed : []).slice(-SH_MAX).map(h => h && typeof h === 'object' && vOk(h.v) ? ({ at: numv(h.at, 0, [0, 4e12]), to: numv(h.to, 0, [0, 4e12]), ret: numv(h.ret, 0, [-100, 1e6]), rug: h.rug === true, v: h.v }) : null).filter(Boolean);
  b.black = [...new Set((Array.isArray(d.black) ? d.black : []).map(x => str(x, 80)).filter(Boolean))].slice(-500);
  b.wait = (Array.isArray(d.wait) ? d.wait : []).slice(0, WAIT_MAX).filter(w => Array.isArray(w) && typeof w[0] === 'string').map(w => [str(w[0], 80), numv(w[1], 0, [0, 4e12])]).filter(w => w[0]);
  b.seen = (Array.isArray(d.seen) ? d.seen : []).slice(-4000).map(x => str(x, 80)).filter(Boolean);
  b.log = (Array.isArray(d.log) ? d.log : []).slice(-200).map(l => l && typeof l === 'object' ? ({ t: numv(l.t, 0, [0, 4e12]), sym: str(l.sym, 24), msg: str(l.msg, 260), ok: l.ok === true }) : null).filter(Boolean);
  b.scanned = numv(d.scanned, 0, [0, 1e9]); b.untrad = numv(d.untrad, 0, [0, 1e9]); b.gaps = numv(d.gaps, 0, [0, 1e6]); b.startedAt = numv(d.startedAt, 0, [0, 4e12]); b.lastTick = numv(d.lastTick, 0, [0, 4e12]);
  return b;
}
let ARN = arFresh();
const AU = { err: '', last: 0, busy: false, setOpen: false, wl: null };
const arEq = st => st.cash + st.pos.reduce((a, p) => a + p.qty * p.last, 0);
const arAddrs = () => [...new Set([...ARN.wait.map(w => w[0]), ...ARN.sh.open.map(h => h.addr), ...STRATS.flatMap(d => ARN.st[d.id].pos.map(p => p.addr))])];
function arLog(sym, msg, ok) { ARN.log.push({ t: Date.now(), sym, msg, ok: !!ok }); if (ARN.log.length > 200) ARN.log.shift(); }
function arBlack(c) { if (c && !ARN.black.includes(c)) { ARN.black.push(c); if (ARN.black.length > 500) ARN.black.shift(); } }

/* Décision d'une stratégie sur un token : renvoie '' (accepté) ou la raison du refus */
function arEval(d, p, pr, size) {
  const f = d.f, age = p.created ? (Date.now() - p.created) / 60000 : null;
  if (age !== null && age > f.maxAgeH * 60) return 'age';
  if (p.liq < f.minLiq) return 'liq';
  if (f.minVol1h && p.vol1h < f.minVol1h) return 'vol';
  if (f.maxPump1h && p.ch1h > f.maxPump1h) return 'pump';
  if (f.noDump && p.ch1h < -40) return 'dump';
  if (f.minTx1h && p.buys + p.sells < f.minTx1h) return 'tx';
  if (f.maxFdvLiq && p.fdv > 0 && p.fdv / Math.max(p.liq, 1) > f.maxFdvLiq) return 'fdv';
  if (f.minScore && scoreOf(p, { minLiq: f.minLiq }) < f.minScore) return 'score';
  if (f.share && size / Math.max(p.liq, 1) * 100 > f.share) return 'share';
  if (!f.rc) return '';
  if (!pr) return 'rcunk';
  if (f.rugged && pr.rugged) return 'rugged';
  if (f.black && pr.creator && ARN.black.includes(pr.creator)) return 'black';
  if (f.mint) { if (pr.mint === null) return 'rcunk'; if (pr.mint) return 'mint'; }
  if (f.freeze) { if (pr.freeze === null) return 'rcunk'; if (pr.freeze) return 'freeze'; }
  if (f.danger && pr.danger) return 'danger';
  if (f.risk !== null) { if (pr.score === null) return 'rcunk'; if (pr.score > f.risk) return 'risk'; }
  if (f.lp !== null) { if (pr.lp === null) return 'rcunk'; if (pr.lp < f.lp) return 'lp'; }
  if (f.top10 !== null) { if (pr.top10 === null) return 'rcunk'; if (pr.top10 > f.top10) return 'top10'; }
  if (f.dev !== null) { if (pr.dev === null) return 'rcunk'; if (pr.dev > f.dev) return 'dev'; }
  if (f.insN !== null) { if (pr.insN === null) return 'rcunk'; if (pr.insN > f.insN) return 'insn'; }
  if (f.insPct !== null) { if (pr.ins === null) return 'rcunk'; if (pr.ins > f.insPct) return 'bundle'; }
  if (f.serial && pr.serial > f.serial) return 'serial';
  return '';
}
function arOpen(d, st, p, sc, pr) {
  const s = ARN.settings, size = Math.min(arEq(st) * s.stakePct / 100, st.cash);
  if (size < 1) return 'cash';
  const slip = s.slipPct + impact(size, p.liq), fee = size * s.feePct / 100, fill = p.px * (1 + slip / 100), qty = (size - fee) / fill;
  st.cash -= size; st.bought++;
  st.pos.push({ addr: p.addr, sym: p.sym, entry: fill, qty, qty0: qty, cost: size, out: 0, fees: fee, peak: p.px, last: p.px, liq0: p.liq, liq: p.liq, at: Date.now(), steps: 0, score: sc, miss: 0,
    creator: pr ? pr.creator : '', dev0: pr && pr.dev !== null ? pr.dev : 0, ins0: pr && pr.ins !== null ? pr.ins : 0, rcAt: Date.now(), gap: 0 });
  return '';
}
/* Vente (partielle ou totale). Un rug rend environ 3 % de la mise restante. Renvoie true si la position est soldée. */
function arSell(st, p, qtySell, reason, rug, final) {
  const s = ARN.settings; qtySell = Math.min(qtySell, p.qty);
  let proceeds, fee = 0;
  if (rug) proceeds = p.cost * (qtySell / p.qty0) * 0.03;
  else { const val = qtySell * p.last, slip = s.slipPct + impact(val, p.liq), gross = val * (1 - slip / 100); fee = gross * s.feePct / 100; proceeds = gross - fee; }
  p.qty -= qtySell; p.out += proceeds; p.fees += fee; st.cash += proceeds;
  if (final || p.qty <= p.qty0 * 1e-6) {
    st.closed.push({ sym: p.sym, at: p.at, to: Date.now(), cost: p.cost, out: p.out, fees: p.fees, reason, inv: p.gap ? 1 : 0 });
    if (st.closed.length > CLOSED_MAX) st.closed.shift();
    st.pos = st.pos.filter(x => x !== p);
    if (rug && p.creator) arBlack(p.creator);
    return true;
  }
  return false;
}
function arClose(d, st, p, reason, rug) {
  arSell(st, p, p.qty, reason, rug, true);
  arLog(p.sym, `${d.name} · ${reason} (${pc((p.out / p.cost - 1) * 100)})`, p.out >= p.cost);
}
function arExit(d, st, p) {
  const x = d.x, pct = (p.last / p.entry - 1) * 100, hours = (Date.now() - p.at) / 3600e3;
  if (x.liqDrop && p.liq < p.liq0 * (1 - x.liqDrop / 100)) return arClose(d, st, p, `Liquidité retirée de plus de ${x.liqDrop} %`, false);
  if (pct <= -x.stop) return arClose(d, st, p, 'Stop-loss', false);
  while (p.steps < x.ladder.length && pct >= x.ladder[p.steps][0]) {
    const [lv, fr] = x.ladder[p.steps]; p.steps++;
    const done = arSell(st, p, p.qty0 * fr, `Palier +${lv} %`, false, false);
    arLog(p.sym, `${d.name} · palier +${lv} % : ${Math.round(fr * 100)} % de la position vendu`, true);
    if (done) return;
  }
  const armed = x.trailAfterTake ? p.steps > 0 : (p.peak / p.entry - 1) * 100 >= x.trailAt;
  if (armed && x.trailDist && p.last <= p.peak * (1 - x.trailDist / 100)) return arClose(d, st, p, 'Stop suiveur', false);
  if (hours >= x.maxHoldH && (x.holdMinPct === null || pct < x.holdMinPct)) return arClose(d, st, p, 'Durée maximale', false);
}
function shClose(h, rug) {
  const s = ARN.settings; ARN.sh.open = ARN.sh.open.filter(x => x !== h);
  if (h.gap) return;
  let ret;
  if (rug) ret = -97; else { const val = h.qty * h.last, slip = s.slipPct + impact(val, h.liq); ret = (val * (1 - slip / 100) * (1 - s.feePct / 100) / SH_SIZE - 1) * 100; }
  ARN.sh.closed.push({ at: h.at, to: Date.now(), ret: clamp(ret, -100, 1e6), rug: !!rug, v: h.v });
  if (ARN.sh.closed.length > SH_MAX) ARN.sh.closed.shift();
}
function arManage(map) {
  for (const d of STRATS) {
    const st = ARN.st[d.id];
    for (const p of st.pos.slice()) {
      const q = map.get(p.addr);
      if (!q) { p.miss++; if (p.miss >= 8) arClose(d, st, p, 'Plus de données (rug probable)', true); continue; }
      p.miss = 0; p.last = q.px; p.liq = q.liq; if (q.px > p.peak) p.peak = q.px;
      if (p.liq < p.liq0 * 0.2 || q.px < p.entry * 0.1) { arClose(d, st, p, 'Rug : liquidité retirée', true); continue; }
      arExit(d, st, p);
    }
  }
  for (const h of ARN.sh.open.slice()) {
    const q = map.get(h.addr);
    if (!q) { h.miss++; if (h.miss >= 8) shClose(h, true); continue; }
    h.miss = 0; h.last = q.px; h.liq = q.liq; if (q.px > h.peak) h.peak = q.px;
    if (h.liq < h.liq0 * 0.2 || q.px < h.entry * 0.1) { shClose(h, true); continue; }
    const pct = (q.px / h.entry - 1) * 100, up = (h.peak / h.entry - 1) * 100;
    if (pct <= -SH_X.stop || (up >= SH_X.trailAt && q.px <= h.peak * (1 - SH_X.trailDist / 100)) || Date.now() - h.at > SH_X.maxHoldH * 3600e3) shClose(h, false);
  }
}
/* Sorties « le créateur vend » / « les initiés vendent » : une seule analyse par token et par cycle */
async function arRcExits() {
  const s = ARN.settings, got = new Map();
  for (const d of STRATS) {
    if (!d.x.rcExit) continue;
    const st = ARN.st[d.id];
    for (const p of st.pos.slice()) {
      if (!p.creator || Date.now() - (p.rcAt || 0) < (s.demo ? 0 : 60000)) continue;
      if (!got.has(p.addr)) got.set(p.addr, parseReport(s.demo ? demoReport(p.addr) : await fetchReport(p.addr)));
      const pr = got.get(p.addr); p.rcAt = Date.now(); if (!pr) continue;
      if (p.dev0 > 0 && pr.dev !== null && pr.dev < p.dev0 * (1 - EXIT_DEV / 100)) arClose(d, st, p, `Le créateur vend (${p.dev0.toFixed(0)} → ${pr.dev.toFixed(0)} %)`, false);
      else if (p.ins0 > 0 && pr.ins !== null && pr.ins < p.ins0 * (1 - EXIT_INS / 100)) arClose(d, st, p, `Les initiés vendent (${p.ins0.toFixed(0)} → ${pr.ins.toFixed(0)} %)`, false);
    }
  }
}
function arDecide(p, pr) {
  const s = ARN.settings, v = [], parts = []; let any = false;
  for (const d of STRATS) {
    const st = ARN.st[d.id], stake = arEq(st) * s.stakePct / 100;
    let why = arEval(d, p, pr, stake); const acc = !why; st.decided++;
    if (!why) why = st.pos.length >= s.maxPos ? 'full' : arOpen(d, st, p, scoreOf(p, { minLiq: d.f.minLiq }), pr);
    v.push(acc ? '1' : '0');
    if (why) { st.rej[why] = (st.rej[why] || 0) + 1; parts.push(`${d.name} : refusé (${RULES[why]})`); } else { any = true; parts.push(`${d.name} : acheté`); }
  }
  if (ARN.sh.open.length < SH_OPEN_MAX) {
    const slip = s.slipPct + impact(SH_SIZE, p.liq), fill = p.px * (1 + slip / 100);
    ARN.sh.open.push({ addr: p.addr, sym: p.sym, entry: fill, qty: SH_SIZE * (1 - s.feePct / 100) / fill, peak: p.px, last: p.px, liq0: p.liq, liq: p.liq, at: Date.now(), miss: 0, v: v.join(''), gap: 0 });
  }
  arLog(p.sym, parts.join(' · '), any);
}
function arMarkGap() {
  ARN.gaps++;
  for (const d of STRATS) for (const p of ARN.st[d.id].pos) p.gap = 1;
  for (const h of ARN.sh.open) h.gap = 1;
}
async function arTick() {
  if (AU.busy || !ARN.running) return;
  AU.busy = true;
  ARN.settings.demo = !!S.settings.demo;
  const s = ARN.settings;
  try {
    const m = s.demo ? demoMarket(arAddrs(), ARN.seen, true) : await fetchMarket(arAddrs());
    AU.err = ''; AU.last = Date.now();
    if (ARN.lastTick && Date.now() - ARN.lastTick > GAP_MS) arMarkGap();
    ARN.lastTick = Date.now();
    arManage(m.map);
    await arRcExits();
    const seen = new Set(ARN.seen), waitMap = new Map(ARN.wait);
    const markSeen = a => { seen.add(a); ARN.seen.push(a); ARN.scanned++; waitMap.delete(a); };
    let budget = s.demo ? 99 : s.rcPerTick;
    const cands = [...new Set([...m.fresh.filter(a => !seen.has(a)), ...ARN.wait.map(w => w[0])])];
    for (const addr of cands) {
      if (seen.has(addr)) { waitMap.delete(addr); continue; }
      const p = m.map.get(addr);
      if (!p) { if (waitMap.has(addr) && Date.now() - waitMap.get(addr) > 3600e3) waitMap.delete(addr); continue; }
      const age = p.created ? (Date.now() - p.created) / 60000 : null;
      if (age !== null && age > 72 * 60) { markSeen(addr); ARN.untrad++; continue; }
      if (age !== null && age < EVAL_AGE) { if (!waitMap.has(addr) && waitMap.size < WAIT_MAX) waitMap.set(addr, Date.now()); continue; }
      if (p.liq < 10000 || (p.buys >= 20 && p.sells === 0)) { markSeen(addr); ARN.untrad++; continue; }
      let pr = null;
      if (STRATS.some(d => d.f.rc)) {
        if (budget <= 0) continue; budget--;
        pr = parseReport(s.demo ? demoReport(addr) : await fetchReport(addr));
        if (pr && pr.rugged) arBlack(pr.creator);
      }
      markSeen(addr); arDecide(p, pr);
    }
    ARN.wait = [...waitMap.entries()].slice(0, WAIT_MAX);
    if (ARN.seen.length > 4000) ARN.seen = ARN.seen.slice(-4000);
    for (const d of STRATS) {
      const st = ARN.st[d.id], last = st.equity[st.equity.length - 1];
      if (!last || Date.now() - last[0] > (s.demo ? 3000 : 25000)) { st.equity.push([Date.now(), arEq(st)]); if (st.equity.length > 400) st.equity.shift(); }
    }
    lsave();
  } catch (e) { AU.err = errMsg(e); }
  AU.busy = false; lrender();
}
let arTimer = 0;
function arSchedule() { clearTimeout(arTimer); if (!ARN.running) return; arTimer = setTimeout(async () => { arTimer = 0; await arTick(); arSchedule(); }, ARN.settings.demo ? 2000 : ARN.settings.pollSec * 1000); }
async function arWake() {
  try {
    if (ARN.running && ARN.settings.wake && 'wakeLock' in navigator && !AU.wl) { AU.wl = await navigator.wakeLock.request('screen'); AU.wl.addEventListener('release', () => { AU.wl = null; }); }
    else if ((!ARN.running || !ARN.settings.wake) && AU.wl) { const w = AU.wl; AU.wl = null; await w.release(); }
  } catch { AU.wl = null; }
}
function arSetRunning(v) {
  ARN.running = v;
  if (v && !ARN.startedAt) { ARN.startedAt = Date.now(); for (const d of STRATS) ARN.st[d.id].equity.push([Date.now(), arEq(ARN.st[d.id])]); }
  lsave(); lrender(); arWake();
  if (v) arTick().then(arSchedule); else clearTimeout(arTimer);
}
function arSync() {
  if (ARN.running && S.onboarded) { if (!arTimer && !AU.busy) arTick().then(arSchedule); }
  else { clearTimeout(arTimer); arTimer = 0; }
  arWake();
}
function arReset() { const s = ARN.settings; ARN = arFresh(); ARN.settings = s; for (const d of STRATS) ARN.st[d.id].cash = s.balance0; clearTimeout(arTimer); arTimer = 0; arWake(); lsave(); lrender(); }

/* ---------- Statistiques de l'arène ---------- */
const mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const BOOT = new Map();
/* Rééchantillonnage (bootstrap) de la moyenne : donne un intervalle de confiance à 95 %. Graine fixe : le résultat ne saute pas d'un affichage à l'autre. */
function bootMeans(arr) {
  const key = arr.length + ':' + arr.reduce((a, b) => a + b, 0).toFixed(4) + ':' + arr.reduce((a, b) => a + b * b, 0).toFixed(2);
  if (BOOT.has(key)) return BOOT.get(key);
  const r = mulberry(arr.length * 7919 + 13), B = 600, n = arr.length, out = new Float64Array(B);
  for (let b = 0; b < B; b++) { let t = 0; for (let i = 0; i < n; i++) t += arr[(r() * n) | 0]; out[b] = t / n; }
  out.sort(); BOOT.set(key, out); if (BOOT.size > 60) BOOT.delete(BOOT.keys().next().value);
  return out;
}
const ciOf = m => [m[Math.floor(m.length * 0.025)], m[Math.floor(m.length * 0.975)]];
function diffCI(a, b) { const ma = bootMeans(a), mb = bootMeans(b), d = Float64Array.from(ma, (v, i) => v - mb[(i * 7 + 3) % mb.length]); d.sort(); return ciOf(d); }
function arStats(d) {
  const st = ARN.st[d.id], ok = st.closed.filter(t => !t.inv), rets = ok.map(t => (t.out / t.cost - 1) * 100), n = rets.length;
  let peak = -Infinity, dd = 0; for (const [, v] of st.equity) { if (v > peak) peak = v; dd = Math.max(dd, peak > 0 ? (peak - v) / peak * 100 : 0); }
  const eq = arEq(st);
  return { eq, ret: (eq / ARN.settings.balance0 - 1) * 100, n, inv: st.closed.length - n, mean: n ? rets.reduce((a, b) => a + b, 0) / n : null, wr: n ? rets.filter(r => r > 0).length / n * 100 : null, dd,
    fees: st.closed.reduce((a, t) => a + t.fees, 0), rugs: ok.filter(t => /Rug|Plus de/.test(t.reason)).length, ci: n >= 8 ? ciOf(bootMeans(rets)) : null, rets, open: st.pos.length };
}
function arVerdict(d, S_, tem) {
  if (S_.n < 30) return { t: `Pas assez de données (${S_.n} trade${S_.n > 1 ? 's' : ''} sur 30 minimum)`, c: 'muted' };
  const [lo, hi] = S_.ci; let t, c;
  if (lo > 0) { t = 'Moyenne par trade positive, au-delà du simple hasard statistique'; c = 'pos'; }
  else if (hi < 0) { t = 'Moyenne par trade négative'; c = 'neg'; }
  else { t = 'Indistinguable de zéro : ni gagnante ni perdante de façon démontrée'; c = ''; }
  if (d.id !== 'base' && tem && tem.n >= 30) { const [a, b] = diffCI(S_.rets, tem.rets); t += a > 0 ? ' · bat le témoin' : b < 0 ? ' · moins bien que le témoin' : ' · pas de différence nette avec le témoin'; }
  return { t, c };
}
function arCF(i) {
  const A = ARN.sh.closed.filter(x => x.v[i] === '1'), R = ARN.sh.closed.filter(x => x.v[i] === '0');
  const f = a => ({ n: a.length, mean: a.length ? a.reduce((s, x) => s + x.ret, 0) / a.length : null, rug: a.length ? a.filter(x => x.rug).length / a.length * 100 : null, rets: a.map(x => x.ret) });
  return { acc: f(A), ref: f(R) };
}
function arCFText(c) {
  if (c.acc.n < 30 || c.ref.n < 30) return { t: `Pas assez de tokens suivis (${c.acc.n} acceptés, ${c.ref.n} refusés ; 30 de chaque minimum)`, c: 'muted' };
  const [lo, hi] = diffCI(c.acc.rets, c.ref.rets);
  if (lo > 0) return { t: 'Le filtre trie bien : les tokens acceptés ont fait nettement mieux que les refusés', c: 'pos' };
  if (hi < 0) return { t: 'Le filtre trie à l’envers : les tokens refusés auraient fait mieux', c: 'neg' };
  return { t: 'Pas de différence nette entre acceptés et refusés : le filtre ne prouve pas son utilité', c: '' };
}

/* ---------- Rendu de l'arène ---------- */
function arCurve() {
  const all = STRATS.map(d => ARN.st[d.id].equity), t0 = Math.min(...all.filter(e => e.length).map(e => e[0][0])), t1 = Math.max(...all.filter(e => e.length).map(e => e[e.length - 1][0]));
  if (!isFinite(t0) || all.every(e => e.length < 2) || t1 <= t0) return '<div class="empty">Les courbes apparaîtront après quelques scans.</div>';
  const b0 = ARN.settings.balance0, vals = all.flat().map(q => q[1] / b0 * 100 - 100), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), sp = hi - lo || 1, W = 600, H = 200;
  const y = v => (H - 8 - (v - lo) / sp * (H - 16)).toFixed(1);
  const lines = STRATS.map((d, k) => { const e = all[k]; if (e.length < 2) return ''; return `<polyline fill="none" stroke="${d.color}" stroke-width="2.2" vector-effect="non-scaling-stroke" points="${e.map(q => `${((q[0] - t0) / (t1 - t0) * W).toFixed(1)},${y(q[1] / b0 * 100 - 100)}`).join(' ')}"/>`; }).join('');
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Capital simulé des quatre stratégies"><line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="#243044" stroke-dasharray="4 4"/>${lines}</svg><div class="small">${STRATS.map(d => `<span style="color:${d.color}">● ${esc(d.name)}</span>`).join(' &nbsp; ')}</div><div class="small mut">De ${pc(lo, 0)} à ${pc(hi, 0)} · ligne pointillée = capital de départ</div>`;
}
function arSettingsHTML() {
  const s = ARN.settings;
  return `<details class="adv" id="ar-adv" ${AU.setOpen ? 'open' : ''}><summary>Réglages de l’arène</summary>
    <div class="sgroup" style="margin-top:10px"><label class="lflag"><input type="checkbox" data-arflag="wake" ${s.wake ? 'checked' : ''}> <span>Garder l’écran allumé pendant le scan (si l’appareil le permet)</span></label></div>
    <div class="fgrid" style="margin-top:10px">${Object.keys(ALIM).map(k => `<label>${esc(ALABEL[k][0])}<input inputmode="decimal" autocomplete="off" data-arset="${k}" value="${esc(String(s[k]).replace('.', ','))}">${ALABEL[k][1] ? `<span class="r-d">${esc(ALABEL[k][1])}</span>` : ''}</label>`).join('')}</div>
    <p class="muted small" style="margin-top:8px">Les règles des quatre stratégies sont fixes pour que la comparaison reste honnête. Modifier le capital de départ ne remet pas l’arène à zéro : utilise « Remettre à zéro ».</p></details>`;
}
function renderArena() {
  const el = $('#lab-arena'); if (!el || el.hidden) return;
  const a = document.activeElement; if (a && el.contains(a) && a.tagName === 'INPUT') return;
  const demo = !!S.settings.demo, stats = STRATS.map(d => arStats(d)), tem = stats[STRATS.findIndex(d => d.id === 'base')];
  const maxN = Math.max(...stats.map(x => x.n)), days = ARN.startedAt ? (Date.now() - ARN.startedAt) / 864e5 : 0;
  const kp = kpiHTML('Durée du test', ARN.startedAt ? days.toFixed(1).replace('.', ',') + ' j' : '—', 'visé : 14 jours ou plus') + kpiHTML('Tokens analysés', ARN.scanned.toLocaleString('fr-FR'), `${ARN.untrad} écartés d’office (pool trop petit, âge)`) +
    kpiHTML('Tokens suivis en fantôme', String(ARN.sh.closed.length), `${ARN.sh.open.length} en cours`) + kpiHTML('Trades valides (max)', String(maxN), 'visé : 100 par stratégie', maxN >= 100 ? 'pos' : '');
  const comp = STRATS.map((d, k) => {
    const x = stats[k], v = arVerdict(d, x, tem), ci = x.ci ? ` [${pc(x.ci[0], 0)} ; ${pc(x.ci[1], 0)}]` : '';
    return `<div class="lrow"><div class="t"><span style="color:${d.color}">●</span> ${esc(d.name)}</div><div class="n ${x.ret >= 0 ? 'pos' : 'neg'}">${pc(x.ret)}</div>
      <div class="m">Capital ${usd(x.eq)} · ${x.n} trade${x.n > 1 ? 's' : ''} valide${x.n > 1 ? 's' : ''}${x.open ? ` (+${x.open} ouvert${x.open > 1 ? 's' : ''})` : ''} · réussite ${x.wr === null ? '—' : Math.round(x.wr) + ' %'} · moyenne par trade ${x.mean === null ? '—' : pc(x.mean)}${ci} · pire baisse ${x.dd.toFixed(0)} % · frais ${usd(x.fees)} · rugs ${x.rugs}${x.inv ? ` · ${x.inv} exclu${x.inv > 1 ? 's' : ''} (suivi interrompu)` : ''}<br><b class="${v.c}">${esc(v.t)}</b></div>
      <div class="bar" style="grid-column:1/-1"><i style="width:${Math.min(100, x.n).toFixed(0)}%"></i></div></div>`;
  }).join('');
  const cf = STRATS.map((d, k) => {
    if (d.id === 'base') return ''; const c = arCF(k), t = arCFText(c), g = x => x.n ? `${pc(x.mean)} en moyenne · ${Math.round(x.rug)} % de rugs` : '—';
    return `<div class="lrow"><div class="t"><span style="color:${d.color}">●</span> ${esc(d.name)}</div><div class="n"></div><div class="m">Acceptés (${c.acc.n}) : ${g(c.acc)}<br>Refusés (${c.ref.n}) : ${g(c.ref)}<br><b class="${t.c}">${esc(t.t)}</b></div></div>`;
  }).join('');
  const why = STRATS.map(d => { const st = ARN.st[d.id], rows = Object.keys(RULES).map(k => [k, st.rej[k] || 0]).filter(r => r[1] > 0).sort((p, q) => q[1] - p[1]).slice(0, 5);
    return `<div class="lrow"><div class="t"><span style="color:${d.color}">●</span> ${esc(d.name)}</div><div class="n">${st.bought} achat${st.bought > 1 ? 's' : ''}</div><div class="m">${st.decided ? `sur ${st.decided} tokens · ` : ''}${rows.length ? rows.map(([k, n]) => `${esc(RULES[k])} : ${n}`).join(' · ') : 'aucun refus pour l’instant'}</div></div>`; }).join('');
  const lg = ARN.log.slice().reverse().slice(0, 40), dec = lg.length ? lg.map(x => `<div class="lrow"><div class="t ${x.ok ? 'pos' : 'muted'}">${esc(x.sym)}</div><div class="n muted small">${clock(x.t)}</div><div class="m">${esc(x.msg)}</div></div>`).join('') : '<div class="muted small">Rien pour l’instant.</div>';
  const hon = [];
  if (maxN < 30) hon.push(`<b>Trop tôt pour conclure.</b> Aucune stratégie n’a 30 trades valides. En dessous, un bon ou un mauvais résultat peut être du pur hasard. Laisse tourner jusqu’à 100 trades par stratégie, sur au moins deux semaines.`);
  else if (maxN < 100) hon.push(`<b>Encore fragile.</b> Au moins une stratégie dépasse 30 trades, mais aucune n’a 100 trades. Les intervalles affichés sont larges : ne décide rien maintenant.`);
  else hon.push(`<b>Assez de trades pour commencer à regarder.</b> Cherche les stratégies dont l’intervalle reste au-dessus de zéro ET qui battent le témoin, puis exige que ça se reproduise sur une seconde période.`);
  hon.push(`<b>Effet de sélection :</b> tu compares 4 stratégies. Si l’une ressort, c’est peut-être juste la chance du tirage. Si tu en retiens une, remets l’arène à zéro et vérifie qu’elle fait pareil sur une nouvelle période.`);
  hon.push(`<b>Plus favorable que la réalité :</b> les ordres sont supposés passés au prix affiché, avec un slippage et des frais estimés. En vrai, des bots plus rapides, des tokens impossibles à revendre et des frais variables dégradent les résultats. Le papier est un plafond, pas une prévision.`);
  hon.push(`<b>Échantillon biaisé :</b> seuls les tokens qui ont payé un profil DexScreener sont vus. Les contrôles RugCheck sont des approximations, et la structure de sa réponse est déduite : un champ absent compte comme inconnu et fait refuser le token.`);
  if (ARN.gaps) hon.push(`<b>${ARN.gaps} interruption${ARN.gaps > 1 ? 's' : ''} de plus de 10 minutes</b> (app fermée ou en veille) : les positions et tokens suivis à ce moment-là sont exclus des statistiques, car leurs sorties n’auraient pas été surveillées.`);
  if (demo) hon.push(`<b>Mode démo :</b> marché fictif accéléré. Ces résultats ne prouvent rien, ils servent seulement à vérifier que l’écran fonctionne.`);
  el.innerHTML = `<div class="panel"><div class="lctl"><button class="btn primary" data-act="arrun">${ARN.running ? 'Pause du scan' : (ARN.startedAt ? 'Reprendre le scan' : 'Lancer le scan')}</button><span class="small muted"><span class="dot ${AU.err ? 'err' : ARN.running ? 'ok pulse' : ''}"></span> ${ARN.running ? (demo ? 'Marché fictif accéléré' : 'Scan en cours') + (AU.last ? ' · dernier scan à ' + clock(AU.last) : '…') : 'En pause'} · ${ARN.wait.length} token${ARN.wait.length > 1 ? 's' : ''} en attente de leurs ${EVAL_AGE} min</span></div>
    <p class="muted small" style="margin-top:8px">Quatre stratégies de memecoins Solana tournent en parallèle sur exactement les mêmes tokens, chacune avec son capital fictif. Aucun argent réel, aucune clé de portefeuille. Chaque token est évalué une seule fois, quand il a ${EVAL_AGE} minutes, par toutes les stratégies en même temps.</p>
    <details class="adv" ${ARN.startedAt ? '' : 'open'}><summary>Comment bien l’utiliser</summary>
      <p class="small"><b>1.</b> Appuie sur « Lancer le scan » et laisse l’app ouverte. Le mieux : un PC, un onglet épinglé, mise en veille désactivée. Sur iPhone, l’app s’arrête dès qu’elle passe en arrière-plan.</p>
      <p class="small"><b>2.</b> Ne touche pas aux stratégies en cours de route : changer une règle après avoir vu les résultats fausse tout. Seuls le capital, la mise et le slippage sont réglables.</p>
      <p class="small"><b>3.</b> Attends 14 jours et 100 trades par stratégie. Tant que « Pas assez de données » s’affiche, ne tire aucune conclusion.</p>
      <p class="small"><b>4.</b> Lis d’abord « Les filtres protègent-ils ? » et la comparaison avec le témoin, pas le gain brut. Une stratégie qui ne bat pas le témoin n’apporte rien.</p>
      <p class="small"><b>5.</b> Si une stratégie ressort, remets tout à zéro et refais une période pour voir si elle recommence. Ensuite seulement, et avec une somme que tu peux perdre, tu peux envisager d’aller plus loin.</p></details>
    <details class="adv"><summary>Les 4 stratégies comparées</summary>${STRATS.map(d => `<p class="small"><b style="color:${d.color}">${esc(d.name)}</b> — ${esc(d.desc)}</p>`).join('')}</details></div>
    ${AU.err ? `<div class="banner err" role="alert">Scan impossible : ${esc(AU.err)}. Nouvelle tentative au prochain cycle.</div>` : ''}
    <div class="kpis">${kp}</div>
    <div class="panel"><h2>Comparaison</h2><p class="small mut">La barre montre l’avancement vers 100 trades valides. L’intervalle entre crochets est la plage plausible de la moyenne par trade (95 %).</p>${comp}</div>
    <div class="grid2"><div class="panel"><h2>Capital simulé</h2>${arCurve()}</div><div class="panel verdict"><h2>Lecture honnête</h2>${hon.map(x => `<p class="small">${x}</p>`).join('')}</div></div>
    <div class="panel"><h2>Les filtres protègent-ils ?</h2><p class="small mut">Chaque token est aussi suivi en fantôme avec la même sortie standard, qu’il ait été acheté ou refusé. On compare ce que les tokens acceptés et refusés ont fait ensuite.</p>${cf}</div>
    <div class="panel"><h2>Pourquoi les tokens sont refusés</h2>${why}</div>
    <div class="panel"><h2>Dernières décisions</h2>${dec}</div>
    <div class="panel">${arSettingsHTML()}<div class="lbtns"><button class="btn danger" data-act="arreset">Remettre à zéro</button></div></div>`;
}

/* ---------- État du labo : sauvegarde locale ---------- */
const LAB_KEY = 'denicheur.lab';
const LU = { tab: 'bt', err: '', last: 0, busy: false, setOpen: false, resetWhat: 'sim' };
let SIM = fresh();
const BT_DEFAULT = () => ({ iv: '4h', coins: BT_COINS.slice(0, 12), fee: 0.1, slip: 0.05, strat: 'all' });
const BTS = { ...BT_DEFAULT(), busy: false, prog: 0, err: '', res: null, sel: 0, data: {}, msg: '' };
function btClean(j) {
  j = j && typeof j === 'object' ? j : {}; const d = BT_DEFAULT();
  return { iv: BT_IV[j.iv] ? j.iv : d.iv, coins: Array.isArray(j.coins) ? j.coins.filter(c => BT_COINS.includes(c)) : d.coins, fee: numv(j.fee, d.fee, [0, 2]), slip: numv(j.slip, d.slip, [0, 2]), strat: ['all', 'donchian', 'rsi', 'sma'].includes(j.strat) ? j.strat : d.strat };
}
function labClean(d) { d = d && typeof d === 'object' ? d : {}; return { tab: ['sim', 'arena'].includes(d.tab) ? d.tab : 'bt', sim: cleanState(d.sim), bt: btClean(d.bt), arena: arenaClean(d.arena) }; }
function labApply(c) { LU.tab = c.tab; SIM = c.sim; SIM.running = false; ARN = c.arena; ARN.running = false; Object.assign(BTS, c.bt, { res: null, err: '' }); }
const labSnapshot = () => ({ tab: LU.tab, sim: SIM, arena: ARN, bt: { iv: BTS.iv, coins: BTS.coins, fee: BTS.fee, slip: BTS.slip, strat: BTS.strat } });
let lsaveT = 0;
function lsave() { clearTimeout(lsaveT); lsaveT = 0; try { localStorage.setItem(LAB_KEY, JSON.stringify(labSnapshot())); } catch { /* stockage plein */ } }
try { const raw = localStorage.getItem(LAB_KEY); if (raw) { const c = labClean(JSON.parse(raw)); LU.tab = c.tab; SIM = c.sim; ARN = c.arena; Object.assign(BTS, c.bt); } } catch { /* états par défaut */ }
const nextTick2 = nextTick;

/* ---------- Rendu du simulateur memecoins ---------- */
function simSettingsHTML() {
  const s = SIM.settings;
  return `<details class="adv" id="sim-adv" ${LU.setOpen ? 'open' : ''}><summary>Réglages du simulateur</summary>
    <div class="sgroup" style="margin-top:10px"><label class="lflag"><input type="checkbox" data-simflag="rcOn" ${s.rcOn ? 'checked' : ''}> <span>Contrôler le créateur et les initiés avec RugCheck</span></label><label class="lflag"><input type="checkbox" data-simflag="rcStrict" ${s.rcStrict ? 'checked' : ''}> <span>Refuser si l’analyse RugCheck est indisponible (recommandé)</span></label></div><div class="fgrid" style="margin-top:10px">${Object.keys(LIMITS).map(k => `<label>${esc(LABEL[k][0])}<input inputmode="decimal" autocomplete="off" data-simset="${k}" value="${esc(String(s[k]).replace('.', ','))}">${LABEL[k][1] ? `<span class="r-d">${esc(LABEL[k][1])}</span>` : ''}</label>`).join('')}</div><p class="muted small" style="margin-top:8px">Modifier le capital de départ ne remet pas la simulation à zéro : utilise « Remettre à zéro ».</p>
    <p class="muted small"><b>Non faisable avec des sources gratuites :</b> acheter au « bloc 0 » (réservé aux bots ultra-rapides) et suivre en direct tous les wallets d’anciens rugs. L’app retient seulement les créateurs qu’elle a vus rugger elle-même ou que RugCheck signale (liste noire : ${SIM.black.length}).</p></details>`;
}
function renderSim() {
  const el = $('#lab-sim'); if (!el || el.hidden) return;
  const a = document.activeElement; if (a && el.contains(a) && a.tagName === 'INPUT') return;
  const st = stats(), demo = !!S.settings.demo;
  const kp = kpiHTML('Capital simulé', usd(st.eq), `départ ${usd(SIM.settings.balance0)}`, st.total >= 0 ? 'pos' : 'neg') + kpiHTML('Résultat', pc(st.totalPct), usd(st.total), st.total >= 0 ? 'pos' : 'neg') +
    kpiHTML('Taux de réussite', st.wr === null ? '—' : Math.round(st.wr) + ' %', `${st.n} trade${st.n > 1 ? 's' : ''} clôturé${st.n > 1 ? 's' : ''}`) + kpiHTML('Pire baisse', SIM.equity.length > 2 ? '−' + st.dd.toFixed(1).replace('.', ',') + ' %' : '—', `frais payés ${usd(st.fees)}`, 'neg');
  const open = SIM.pos.length ? SIM.pos.map(p => { const v = p.qty * p.last, pl = (v / p.cost - 1) * 100; return `<div class="lrow"><div class="t">${esc(p.sym)}</div><div class="n ${pl >= 0 ? 'pos' : 'neg'}">${pc(pl)}</div><div class="m">Mis ${usd(p.cost)} · entrée ${price(p.entry)} · actuel ${price(p.last)} · score ${p.score} · depuis ${dur(Date.now() - p.at)}</div></div>`; }).join('') : '<div class="muted small">Aucune position ouverte.</div>';
  const cl = SIM.closed.slice().reverse().slice(0, 40), closed = cl.length ? cl.map(t => { const pl = t.out - t.cost; return `<div class="lrow"><div class="t">${esc(t.sym)}</div><div class="n ${pl >= 0 ? 'pos' : 'neg'}">${pc(pl / t.cost * 100)} · ${usd(pl)}</div><div class="m">${esc(t.reason)} · tenu ${dur(t.to - t.at)} · frais ${usd(t.fees)} · ${clock(t.to)}</div></div>`; }).join('') : '<div class="muted small">Aucun trade clôturé.</div>';
  const lg = SIM.log.slice().reverse().slice(0, 40), dec = lg.length ? lg.map(x => `<div class="lrow"><div class="t ${x.ok ? 'pos' : 'muted'}">${esc(x.sym)}</div><div class="n muted small">${clock(x.t)}</div><div class="m">${esc(x.msg)}</div></div>`).join('') : '<div class="muted small">Rien pour l’instant.</div>';
  el.innerHTML = `<div class="panel"><div class="lctl"><button class="btn primary" data-act="simrun">${SIM.running ? 'Pause du scan' : 'Lancer le scan'}</button><span class="small muted"><span class="dot ${LU.err ? 'err' : SIM.running ? 'ok pulse' : ''}"></span> ${SIM.running ? (demo ? 'Marché fictif accéléré' : 'Scan en cours') + (LU.last ? ' · dernier scan à ' + clock(LU.last) : '…') : 'En pause'} · ${SIM.pos.length} position${SIM.pos.length > 1 ? 's' : ''}</span></div>
    <p class="muted small" style="margin-top:8px">Simule l’achat de nouveaux tokens Solana selon tes règles (données publiques DexScreener, ou marché fictif en mode démo). Aucun argent réel, aucune clé de portefeuille. Le scan ne tourne que tant que l’app est ouverte. Règles : créateur, initiés (assimilés aux achats groupés) et rugs passés via RugCheck, plus liquidité, volume, âge et activité via DexScreener.</p></div>
    ${LU.err ? `<div class="banner err" role="alert">Scan impossible : ${esc(LU.err)}. Nouvelle tentative au prochain cycle.</div>` : ''}
    <div class="kpis">${kp}</div>
    <div class="grid2"><div class="panel"><h2>Capital simulé</h2>${curveSVG()}</div><div class="panel"><h2>Entonnoir de filtrage</h2>${funnelHTML()}</div></div>
    <div class="panel verdict">${verdictHTML(st)}</div>
    <div class="panel"><h2>Positions ouvertes</h2>${open}</div><div class="panel"><h2>Trades clôturés</h2>${closed}</div><div class="panel"><h2>Dernières décisions</h2>${dec}</div>
    <div class="panel">${simSettingsHTML()}<div class="lbtns"><button class="btn danger" data-act="simreset">Remettre à zéro</button></div></div>`;
}
function lrender() {
  const el = $('#view-lab'); if (!el) return;
  $$('#labtabs [data-act="labtab"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === LU.tab)));
  $('#lab-bt').hidden = LU.tab !== 'bt'; $('#lab-sim').hidden = LU.tab !== 'sim'; const lar = $('#lab-arena'); if (lar) lar.hidden = LU.tab !== 'arena';
  if (LU.tab === 'sim') renderSim(); else if (LU.tab === 'arena') renderArena(); else if (!$('#lab-bt').firstChild) btRender();
}
function setRunning(v) {
  SIM.running = v; if (v && !SIM.startedAt) { SIM.startedAt = Date.now(); SIM.equity.push([Date.now(), equityNow()]); }
  lsave(); lrender(); if (v) { tick().then(schedule); } else clearTimeout(timer);
}
function labSync() {
  arSync();
  if (SIM.running && S.onboarded && !document.hidden) { if (!timer && !LU.busy) tick().then(schedule); }
  else { clearTimeout(timer); timer = 0; }
}
function simReset() { const s = SIM.settings; SIM = fresh(); SIM.settings = s; SIM.cash = s.balance0; DM.tokens.clear(); clearTimeout(timer); timer = 0; lsave(); lrender(); }

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'labtab') { LU.tab = ['sim', 'arena'].includes(b.dataset.v) ? b.dataset.v : 'bt'; lsave(); lrender(); }
  else if (a === 'arrun') arSetRunning(!ARN.running);
  else if (a === 'arreset') { LU.resetWhat = 'arena'; openConfirm('Remettre l’arène à zéro ?', 'Les quatre portefeuilles, le journal, les tokens suivis en fantôme et la liste noire seront effacés. Les réglages sont conservés.', 'lab-reset', 'Remettre à zéro', true); }
  else if (a === 'simrun') setRunning(!SIM.running);
  else if (a === 'simreset') { LU.resetWhat = 'sim'; openConfirm('Remettre le simulateur à zéro ?', 'Positions, journal et courbe seront effacés. Les réglages du simulateur sont conservés.', 'lab-reset', 'Remettre à zéro', true); }
  else if (a === 'btcoin') { const c = b.dataset.c; BTS.coins = BTS.coins.includes(c) ? BTS.coins.filter(x => x !== c) : [...BTS.coins, c]; btSave(); btRender(); }
  else if (a === 'btall') { BTS.coins = BTS.coins.length === BT_COINS.length ? BT_COINS.slice(0, 12) : BT_COINS.slice(); btSave(); btRender(); }
  else if (a === 'btrun') btRun();
  else if (a === 'btsel') { BTS.sel = Number(b.dataset.i) || 0; btRender(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'bt-iv' && BT_IV[t.value]) { BTS.iv = t.value; BTS.res = null; btSave(); btRender(); }
  else if (t.id === 'bt-strat' && ['all', 'donchian', 'rsi', 'sma'].includes(t.value)) { BTS.strat = t.value; btSave(); }
  else if (t.id === 'bt-fee') { BTS.fee = numv(t.value, 0.1, [0, 2]); t.value = String(BTS.fee).replace('.', ','); btSave(); }
  else if (t.id === 'bt-slip') { BTS.slip = numv(t.value, 0.05, [0, 2]); t.value = String(BTS.slip).replace('.', ','); btSave(); }
  else if (t.dataset && t.dataset.arflag) { if (t.dataset.arflag === 'wake') { ARN.settings.wake = t.checked; lsave(); arWake(); } }
  else if (t.dataset && t.dataset.arset) { const k = t.dataset.arset; if (!ALIM[k]) return; ARN.settings[k] = numv(t.value, ADEF[k], ALIM[k]); t.value = String(ARN.settings[k]).replace('.', ','); lsave(); clearTimeout(arTimer); arTimer = 0; arSync(); }
  else if (t.dataset && t.dataset.simflag) { const k = t.dataset.simflag; if (k === 'rcOn' || k === 'rcStrict') { SIM.settings[k] = t.checked; lsave(); } }
  else if (t.dataset && t.dataset.simset) { const k = t.dataset.simset; if (!LIMITS[k]) return; SIM.settings[k] = numv(t.value, DEF[k], LIMITS[k]); t.value = String(SIM.settings[k]).replace('.', ','); lsave(); clearTimeout(timer); timer = 0; labSync(); }
});
document.addEventListener('toggle', e => { if (e.target && e.target.id === 'sim-adv') LU.setOpen = e.target.open; if (e.target && e.target.id === 'ar-adv') AU.setOpen = e.target.open; }, true);
addEventListener('pagehide', lsave);
addEventListener('online', () => { if (SIM.running && S.onboarded) tick(); if (ARN.running && S.onboarded) arTick(); });

window.Lab = {
  render() { lrender(); if (LU.tab === 'bt') btRender(); },
  sync: labSync,
  snapshot: labSnapshot,
  clean: labClean,
  apply(c) { labApply(c); clearTimeout(timer); timer = 0; clearTimeout(arTimer); arTimer = 0; lsave(); lrender(); btRender(); },
  resetSim() { if (LU.resetWhat === 'arena') arReset(); else simReset(); LU.resetWhat = 'sim'; },
  _test: { simCoin, tick, ind, arTick, arSetRunning, ar: () => ARN, busy: () => AU.busy, STRATS, RULES, parseReport, arStats, arVerdict, arCF, arCFText },
  wipe() { try { localStorage.removeItem(LAB_KEY); } catch { /* ignoré */ } clearTimeout(timer); timer = 0; SIM = fresh(); ARN = arFresh(); clearTimeout(arTimer); arTimer = 0; arWake(); Object.assign(BTS, BT_DEFAULT(), { res: null, err: '', data: {} }); DM.tokens.clear(); LU.tab = 'bt'; },
};

if (S.onboarded) labSync();
})();
