'use strict';
/* Appels réseau du bot : même comportement que dans l'appli (délai de 15 s, erreurs normalisées). */
async function getJSON(url, headers) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'denicheur-arena-bot', ...(headers || {}) }, signal: ctl.signal, redirect: 'follow' });
    if (r.status === 429) throw new Error('rate');
    if (r.status === 401 || r.status === 403) throw new Error('auth');
    if (!r.ok) throw new Error('http ' + r.status);
    let data;
    try { data = await r.json(); } catch { throw new Error('badjson'); }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('timeout');
    if (e instanceof TypeError) throw new Error('network');
    throw e;
  } finally { clearTimeout(t); }
}
function errMsg(e) {
  const m = (e && e.message) || '';
  if (m === 'timeout') return 'délai dépassé (15 s)';
  if (m === 'rate') return 'limite d’appels atteinte (429)';
  if (m === 'auth') return 'accès refusé par la source (401/403)';
  if (m.startsWith('http ')) return 'réponse ' + m.slice(5) + ' de la source';
  if (m === 'badjson') return 'réponse illisible';
  return 'source inaccessible';
}
module.exports = { getJSON, errMsg };
