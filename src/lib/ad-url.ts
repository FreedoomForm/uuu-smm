// The ad-link normalizer — shared by the apply form (client) and the
// applications API (server). Real users paste «t.me/kanal», «instagram.com/p/x»,
// «www.tiktok.com/@me» or even «@kanal» — every one of these MUST become a
// valid https:// link instead of silently blocking the заявка (the 27.10 bug:
// the form's send button sat disabled with zero feedback because the raw link
// had no protocol, so the заявка never reached the customer).
export function normalizeAdUrl(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  // «@handle» → the Telegram channel link
  if (/^@[A-Za-z0-9_]{3,}$/.test(s)) return `https://t.me/${s.slice(1)}`;
  if (/^https?:\/\//i.test(s)) return s;
  // domain-ish start («t.me/…», «instagram.com/…», «www.…») → add the protocol
  if (/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+([/?#].*)?$/i.test(s)) return `https://${s}`;
  return s;
}

// The final client-side gate: a normalized http(s) link with a domain.
export function adUrlOk(raw: string): boolean {
  const u = normalizeAdUrl(raw);
  return /^https?:\/\/\S+\.\S+/i.test(u);
}
