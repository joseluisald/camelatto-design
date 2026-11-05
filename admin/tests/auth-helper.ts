// Respect the authentication service's real attempt limit during HTTP tests.
export async function loginForTest(url: string, origin: string, email: string, password: string) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (response.status !== 429 || attempt >= 2) return response;
    const seconds = Math.min(15, Math.max(1, Number(response.headers.get('X-Retry-After')) || 10));
    await response.arrayBuffer();
    await new Promise(resolve => setTimeout(resolve, (seconds + 1) * 1000));
  }
}
