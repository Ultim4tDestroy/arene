'use strict';
/* Bot de l'Arène : charge exactement le même moteur que l'appli (lab.js), le fait tourner pendant DURATION_S secondes
   (un scan toutes les 30 s), puis sauvegarde l'état (state.json) et écrit un rapport lisible (REPORT.md).
   SIMULATION UNIQUEMENT : aucun ordre réel, aucune clé de portefeuille, aucun secret. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { getJSON, errMsg } = require('./net');

const STATE = process.env.STATE_FILE || 'state.json', REPORT = process.env.REPORT_FILE || 'REPORT.md';
const DURATION = Math.max(5, Number(process.env.DURATION_S || 240)), DEMO = process.env.DEMO === '1';

let saved = null;
if (fs.existsSync(STATE) && fs.statSync(STATE).size > 0) {
  try { saved = JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch (e) { console.error('state.json illisible : arrêt pour ne pas écraser les données (' + e.message + ')'); process.exit(1); }
}

/* Environnement minimal pour faire tourner lab.js hors navigateur */
const mem = new Map();
Object.assign(globalThis, {
  window: globalThis, ARENA_GAP_MS: 25 * 60000,
  localStorage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) },
  S: { settings: { demo: DEMO }, onboarded: true },
  $: () => null, $$: () => [], kpiHTML: () => '', openConfirm: () => {}, getJSON, errMsg,
  document: { hidden: false, activeElement: null, addEventListener() {} }, addEventListener() {},
});
mem.set('denicheur.lab', JSON.stringify({ tab: 'arena', arena: saved && saved.arena ? saved.arena : {} }));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'lab.js'), 'utf8'), { filename: 'lab.js' });
const T = globalThis.Lab._test;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const fx = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v)) ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d).replace('.', ',') + ' %';
const money = v => (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' $';

function buildReport() {
  const ar = T.ar(), ST = T.STRATS, stats = ST.map(d => T.arStats(d)), tem = stats[ST.findIndex(d => d.id === 'base')];
  const days = ar.startedAt ? (Date.now() - ar.startedAt) / 864e5 : 0, maxN = Math.max(...stats.map(x => x.n));
  const L = [];
  L.push('# Arène : rapport automatique', '');
  L.push(`Mis à jour le ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC${DEMO ? ' (**MODE DÉMO : marché fictif, ne prouve rien**)' : ''}.`);
  L.push(`Durée du test : **${days.toFixed(1).replace('.', ',')} jour(s)** · tokens analysés : **${ar.scanned}** (dont ${ar.untrad} écartés d’office) · tokens suivis en fantôme : **${ar.sh.closed.length}** · interruptions de suivi : **${ar.gaps}**.`, '');
  L.push('## Conclusion du moment', '');
  if (maxN < 30) L.push('**Trop tôt pour conclure.** Aucune stratégie n’a encore 30 trades valides : à ce stade un bon ou un mauvais résultat peut être du pur hasard.');
  else if (maxN < 100) L.push('**Encore fragile.** Au moins une stratégie dépasse 30 trades, aucune n’en a 100. Les intervalles sont larges : ne décide rien.');
  else L.push('**Assez de trades pour commencer à regarder.** Cherche les stratégies dont l’intervalle reste au-dessus de zéro ET qui battent le témoin, puis exige que ça se reproduise sur une seconde période.');
  L.push('', '## Comparaison des 4 stratégies', '', '| Stratégie | Capital | Trades valides | Réussite | Moyenne par trade [intervalle 95 %] | Rugs | Rythme | Verdict |', '|---|---|---|---|---|---|---|---|');
  ST.forEach((d, k) => {
    const x = stats[k], v = T.arVerdict(d, x, tem), rate = days >= 0.25 ? x.n / days : null;
    const eta = x.n >= 100 ? 'objectif atteint' : rate ? (rate > 0 ? `${rate.toFixed(1).replace('.', ',')}/jour → 100 trades dans ≈ ${Math.ceil((100 - x.n) / rate)} j` : 'aucun trade') : 'trop tôt pour estimer';
    L.push(`| ${d.name} | ${money(x.eq)} (${fx(x.ret)}) | ${x.n}${x.open ? ` (+${x.open} ouvert${x.open > 1 ? 's' : ''})` : ''}${x.inv ? `, ${x.inv} exclu${x.inv > 1 ? 's' : ''}` : ''} | ${x.wr === null ? '—' : Math.round(x.wr) + ' %'} | ${fx(x.mean)}${x.ci ? ` [${fx(x.ci[0], 0)} ; ${fx(x.ci[1], 0)}]` : ''} | ${x.rugs} | ${eta} | ${v.t} |`);
  });
  L.push('', '## Les filtres protègent-ils ?', '', 'Chaque token négociable est suivi en fantôme avec la même sortie standard, acheté ou non. On compare ce que les tokens acceptés et refusés ont fait ensuite.', '', '| Stratégie | Acceptés | Refusés | Verdict |', '|---|---|---|---|');
  ST.forEach((d, k) => {
    if (d.id === 'base') return;
    const c = T.arCF(k), t = T.arCFText(c), g = x => x.n ? `${x.n} tokens · ${fx(x.mean)} en moyenne · ${Math.round(x.rug)} % de rugs` : '—';
    L.push(`| ${d.name} | ${g(c.acc)} | ${g(c.ref)} | ${t.t} |`);
  });
  L.push('', '## Pourquoi les tokens sont refusés', '');
  ST.forEach(d => {
    const st = ar.st[d.id], rows = Object.keys(T.RULES).map(k => [k, st.rej[k] || 0]).filter(r => r[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    L.push(`- **${d.name}** : ${st.bought} achat(s) sur ${st.decided} tokens. ${rows.length ? rows.map(([k, n]) => `${T.RULES[k]} : ${n}`).join(' · ') : 'Aucun refus.'}`);
  });
  L.push('', '## À garder en tête', '');
  L.push('- Tu compares 4 stratégies : si l’une ressort, c’est peut-être la chance du tirage. Refais une seconde période avant de la croire.');
  L.push('- Les ordres sont supposés passés au prix affiché, avec slippage et frais estimés. En vrai, c’est pire : le papier est un plafond, pas une prévision.');
  L.push('- Seuls les tokens avec un profil DexScreener payant sont vus. Les contrôles RugCheck sont des approximations ; un champ absent compte comme inconnu et fait refuser le token.');
  L.push('- Le bot tourne par rafales de 4 minutes ; GitHub peut retarder certaines rafales. Si le suivi est interrompu plus de 25 minutes, les trades concernés sont exclus des statistiques.');
  L.push('- Simulation uniquement. Aucun ordre réel, aucune clé de portefeuille. Ce n’est pas un conseil d’investissement.');
  return L.join('\n') + '\n';
}

(async () => {
  T.arSetRunning(true);
  await sleep(DURATION * 1000);
  T.arSetRunning(false);
  for (let i = 0; i < 150 && T.busy(); i++) await sleep(200);
  const ar = globalThis.Lab.snapshot().arena;
  const err = ar.scanned === 0 && !ar.log.length ? 'aucun token analysé pour l’instant' : '';
  fs.writeFileSync(STATE + '.tmp', JSON.stringify({ savedAt: Date.now(), arena: ar }));
  fs.renameSync(STATE + '.tmp', STATE);
  fs.writeFileSync(REPORT, buildReport());
  console.log(`terminé : ${ar.scanned} tokens analysés, ${ar.sh.closed.length} fantômes clos, ${ar.gaps} interruption(s)${err ? ' · ' + err : ''}`);
  process.exit(0);
})().catch(e => { console.error('erreur :', e && e.stack || e); process.exit(1); });
