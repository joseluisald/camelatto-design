export async function fetchSnapshot({ api, token, candidate = false, transport = fetch }) {
  const url = new URL(api);
  if (candidate && token && !url.searchParams.has('snapshot')) url.searchParams.set('candidate', '1');
  const response = await transport(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(30000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Não foi possível obter o conteúdo do admin (HTTP ${response.status}).`);
  const snapshot = await response.json();
  if (snapshot.schemaVersion !== 1 || !snapshot.settings || !Array.isArray(snapshot.faq) || !Array.isArray(snapshot.portfolio?.projects)) throw new Error('Snapshot de conteúdo inválido.');
  return snapshot;
}
