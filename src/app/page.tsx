import { cookies } from 'next/headers';
import AppRoot from '@/components/app-root';

// Server-rendered boot: the httpOnly session cookie (set by the server on
// login) lets the very first HTML already paint the DASHBOARD shell — header,
// every button and the feed skeletons — while the client bundle hydrates.
// Returning users never see a splash/loading screen (TikTok-style instant
// entry); visitors without the cookie get the login screen pre-rendered.
// The cookie holds only an opaque session token — zero user data on the
// device; /api/auth/me-style confirmation happens client-side via /api/me.
//
// GUEST SHARE LINKS: a visitor without a cookie who opens ?test=<id> lands
// straight in that test (the taking screen, first question up) — the ?test=
// param is forwarded so the very first server render already seeds the
// guest-boot page instead of flashing the login card.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const authed = !!((await cookies()).get('uuu_session')?.value);
  const sp = await searchParams;
  const raw = sp?.test;
  const testParam = (typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '') || '';
  const guestTest = testParam.trim().slice(0, 40) || null;
  return <AppRoot authed={authed} guestTest={guestTest} />;
}
