import { PLANS, daysLeft } from '../model/tiers';
import type { Plan, Tier } from '../model/tiers';

/**
 * Client-side session mirror.
 *
 * The cookie is httpOnly, so the browser cannot read it. This store keeps only
 * the *result* of the server's answer (tier + expiry) and re-asks the server on
 * boot and whenever the tab regains focus after a long pause. Nothing here is a
 * security boundary: gating is enforced in the UI, and the paid value (formats,
 * presets, engines) is already in the bundle, which is honest for an offline
 * tool. The license exists to make the free tier a trial of the workflow, not to
 * hide code.
 */

export interface SessionState {
  status: 'loading' | 'ready' | 'offline';
  tier: Tier;
  exp: number | null;
  subject: string | null;
  /** Display name from Google, or '' for a licence key. */
  name: string;
  /** Google address when signed in with one; null for keys and guests. */
  email: string | null;
  /** True when the server has Google sign-in configured. */
  google: boolean;
  adminEnabled: boolean;
  devSecret: boolean;
  error: string | null;
}

type Listener = () => void;

const DEV_KEY = 'aegis.dev.tier';

class SessionStore {
  state: SessionState = {
    status: 'loading',
    tier: 'free',
    exp: null,
    subject: null,
    name: '',
    email: null,
    google: false,
    adminEnabled: false,
    devSecret: false,
    error: null,
  };

  /** Last answer the server gave, so a dropped connection cannot demote anyone. */
  private known: { tier: Tier; exp: number | null; subject: string | null; name: string; email: string | null } | null = null;

  private listeners = new Set<Listener>();
  private inflight: Promise<void> | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  get plan(): Plan {
    return PLANS[this.state.tier];
  }

  get tier(): Tier {
    return this.state.tier;
  }

  /** Whole days remaining, or null for a session without an expiry. */
  get daysLeft(): number | null {
    return daysLeft(this.state.exp);
  }

  get signedIn(): boolean {
    return this.state.status !== 'loading' && this.state.subject !== null;
  }

  /** PRO or operator, regardless of how the session was obtained. */
  get paid(): boolean {
    return this.state.tier === 'pro' || this.state.tier === 'admin';
  }

  async refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = this.load().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load(): Promise<void> {
    const devTier = this.devOverride();
    try {
      const res = await fetch('/api/auth', {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`session ${res.status}`);
      const data = (await res.json()) as {
        tier?: Tier;
        exp?: number | null;
        subject?: string | null;
        name?: string;
        email?: string | null;
        adminEnabled?: boolean;
        devSecret?: boolean;
        google?: boolean;
      };
      const answer = {
        tier: (data.tier as Tier) ?? 'free',
        exp: data.exp ?? null,
        subject: data.subject ?? null,
        name: data.name ?? '',
        email: data.email ?? null,
      };
      this.known = answer;
      this.state = {
        status: 'ready',
        tier: devTier ?? answer.tier,
        exp: answer.exp,
        subject: answer.subject,
        name: answer.name,
        email: answer.email,
        google: Boolean(data.google),
        adminEnabled: Boolean(data.adminEnabled),
        devSecret: Boolean(data.devSecret),
        error: null,
      };
      this.emit();
    } catch {
      // No functions (vite dev / APK) or a flaky connection. A failed check must
      // never grant a tier — but it must not take one away either: a single
      // dropped request used to flip a paying user to FREE mid-session. Keep the
      // last answer the server gave and try again shortly.
      const last = this.known;
      this.state = {
        ...this.state,
        status: last ? 'offline' : 'offline',
        tier: devTier ?? last?.tier ?? this.state.tier,
        exp: last?.exp ?? this.state.exp,
        subject: last?.subject ?? this.state.subject,
        name: last?.name ?? this.state.name,
        email: last?.email ?? this.state.email,
        error: 'server tidak terjangkau',
      };
      this.emit();
      this.scheduleRetry();
    }
  }

  /** Local-only testing hook; compiled out of production builds by Vite. */
  private devOverride(): Tier | null {
    if (!import.meta.env.DEV || typeof location === 'undefined') return null;
    const param = new URLSearchParams(location.search).get('tier');
    if (param === 'pro' || param === 'admin' || param === 'free') {
      try {
        localStorage.setItem(DEV_KEY, param);
      } catch {
        /* ignore */
      }
      return param;
    }
    try {
      const stored = localStorage.getItem(DEV_KEY);
      if (stored === 'pro' || stored === 'admin' || stored === 'free') return stored;
    } catch {
      /* ignore */
    }
    return null;
  }

  private retry: ReturnType<typeof setTimeout> | null = null;

  /** One quiet retry, then hand back to the visibility listener. */
  private scheduleRetry(): void {
    if (this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.refresh();
    }, 8000);
  }

  /** Full-page redirect to Google; the server comes back with a session. */
  signInGoogle(remember = true): void {
    const flag = remember ? '1' : '0';
    location.href = `/api/auth?google=start&remember=${flag}`;
  }

  /** Returns an error message, or null on success. */
  async signIn(key: string, remember = true): Promise<string | null> {
    return this.submit({ key: key.trim(), remember });
  }

  async signInAdmin(password: string, remember = true): Promise<string | null> {
    return this.submit({ admin: password, remember });
  }

  private async submit(body: Record<string, string | boolean>): Promise<string | null> {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 429) return 'Terlalu banyak percobaan. Tunggu satu menit.';
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error === 'admin_disabled') return 'Konsol operator belum diaktifkan di server.';
        if (data.error === 'revoked') return 'Kunci ini sudah dicabut. Hubungi operator di Telegram.';
        if (body.admin) return 'Kata sandi operator salah.';
        return 'Kunci tidak dikenali atau sudah kedaluwarsa.';
      }
      const data = (await res.json()) as {
        tier?: Tier;
        exp?: number | null;
        subject?: string | null;
        name?: string;
        email?: string | null;
      };
      const answer = {
        tier: data.tier ?? 'free',
        exp: data.exp ?? null,
        subject: data.subject ?? null,
        name: data.name ?? '',
        email: data.email ?? null,
      };
      this.known = answer;
      this.state = {
        ...this.state,
        status: 'ready',
        tier: answer.tier,
        exp: answer.exp,
        subject: answer.subject,
        name: answer.name,
        email: answer.email,
        error: null,
      };
      this.emit();
      return null;
    } catch {
      return 'Server tidak terjangkau. Coba lagi.';
    }
  }

  async signOut(): Promise<void> {
    try {
      await fetch('/api/auth', { method: 'DELETE', credentials: 'same-origin' });
    } catch {
      /* offline sign-out still clears local state */
    }
    try {
      localStorage.removeItem(DEV_KEY);
    } catch {
      /* ignore */
    }
    this.known = null;
    this.state = {
      ...this.state,
      tier: 'free',
      exp: null,
      subject: null,
      name: '',
      email: null,
      error: null,
    };
    this.emit();
  }
}

export const session = new SessionStore();
