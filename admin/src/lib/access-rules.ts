export function can(role: string | null | undefined, area: 'content' | 'leads' | 'admin') {
  return role === 'admin' || (area === 'content' && role === 'editor') || (area === 'leads' && role === 'sales');
}
