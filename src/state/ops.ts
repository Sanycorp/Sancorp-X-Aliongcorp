import { PRO_PRICE } from '../model/tiers';

/**
 * Operator ledger.
 *
 * A licence is a signed token, not a row in a database, so the "account list"
 * lives with the operator: this device keeps the register (who bought, when it
 * ends, what was promised) and the server keeps only the signature. That is
 * deliberate — no customer database to leak, and the ledger can be exported or
 * moved to another phone in one file.
 *
 * The register never decides access. Access is the signed key plus the server's
 * revocation list; this is the bookkeeping around it.
 */

export type OpsTier = 'pro' | 'admin';
export type OpsFilter = 'all' | OpsStatus;
export type OpsStatus = 'active' | 'expiring' | 'expired' | 'revoked';

export interface OpsAccount {
  /** Licence serial — the stable id across renewals. */
  serial: string;
  handle: string;
  tier: OpsTier;
  key: string;
  issued: number;
  expires: number;
  /** Length of the most recent grant, in days. */
  days: number;
  note: string;
  revoked: boolean;
  /** How many paid passes have been applied to this serial. */
  passes: number;
}

export interface OpsStats {
  total: number;
  active: number;
  expiring: number;
  expired: number;
  revoked: number;
  revenue: number;
}

const STORE_KEY = 'aegis.ops.ledger.v1';
const DAY = 86_400_000;
const EXPIRING_WINDOW = 7 * DAY;

const PRICE = Number(PRO_PRICE.replace(/[^\d]/g, '')) || 0;

/** `20261120` → ms at the end of that day, UTC. */
export function stampToMs(stamp: string): number {
  const clean = String(stamp ?? '').replace(/[^\d]/g, '');
  if (clean.length !== 8) return 0;
  const iso = `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T23:59:59Z`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function serialFromKey(key: string): string {
  const parts = String(key ?? '').trim().toUpperCase().split('-');
  return parts.length === 5 && parts[0] === 'AEGIS' ? parts[2] : '';
}

export function expiresFromKey(key: string): number {
  const parts = String(key ?? '').trim().toUpperCase().split('-');
  return parts.length === 5 ? stampToMs(parts[3]) : 0;
}

export function tierFromKey(key: string): OpsTier {
  const parts = String(key ?? '').trim().toUpperCase().split('-');
  return parts[1] === 'ADMIN' ? 'admin' : 'pro';
}

export function statusOf(account: OpsAccount, now = Date.now()): OpsStatus {
  if (account.revoked) return 'revoked';
  if (account.expires <= now) return 'expired';
  if (account.expires - now <= EXPIRING_WINDOW) return 'expiring';
  return 'active';
}

export function dayCount(expires: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((expires - now) / DAY));
}

export class Ledger {
  private items: OpsAccount[] = [];

  constructor(private readonly storage: Storage | null = safeStorage()) {
    this.reload();
  }

  private reload(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) this.items = parsed.filter(isAccount);
    } catch {
      this.items = [];
    }
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORE_KEY, JSON.stringify(this.items));
    } catch {
      /* full or blocked storage must never break the console */
    }
  }

  all(): OpsAccount[] {
    return [...this.items].sort((a, b) => b.issued - a.issued);
  }

  find(serial: string): OpsAccount | undefined {
    return this.items.find((a) => a.serial === serial);
  }

  /** Adds a key. Re-adding the same serial updates it instead of duplicating. */
  add(input: {
    key: string;
    handle?: string;
    note?: string;
    days?: number;
    passes?: number;
  }): OpsAccount | null {
    const key = String(input.key ?? '').trim().toUpperCase();
    const serial = serialFromKey(key);
    const expires = expiresFromKey(key);
    if (!serial || !expires) return null;

    const now = Date.now();
    const existing = this.find(serial);
    if (existing) {
      existing.key = key;
      existing.expires = Math.max(existing.expires, expires);
      existing.tier = tierFromKey(key);
      if (input.handle) existing.handle = input.handle.trim();
      if (input.note) existing.note = input.note.trim();
      if (input.days) existing.days = input.days;
      if (input.passes) existing.passes += input.passes;
      this.persist();
      return { ...existing };
    }

    const account: OpsAccount = {
      serial,
      handle: (input.handle ?? '').trim() || 'tanpa nama',
      tier: tierFromKey(key),
      key,
      issued: now,
      expires,
      days: input.days ?? Math.max(1, Math.round((expires - now) / DAY)),
      note: (input.note ?? '').trim(),
      revoked: false,
      passes: input.passes ?? 1,
    };
    this.items.push(account);
    this.persist();
    return { ...account };
  }

  /** Replaces the key after a renewal; the serial stays the account id. */
  renew(serial: string, key: string, days: number): OpsAccount | null {
    const account = this.find(serial);
    if (!account) return null;
    const expires = expiresFromKey(key);
    if (!expires || serialFromKey(key) !== serial) return null;
    account.key = String(key).trim().toUpperCase();
    account.expires = expires;
    account.days = days;
    account.tier = tierFromKey(key);
    account.passes += 1;
    account.revoked = false;
    this.persist();
    return { ...account };
  }

  /** Marks the account as revoked here; enforcement is the server list. */
  setRevoked(serial: string, revoked: boolean): boolean {
    const account = this.find(serial);
    if (!account) return false;
    account.revoked = revoked;
    this.persist();
    return true;
  }

  setNote(serial: string, note: string): boolean {
    const account = this.find(serial);
    if (!account) return false;
    account.note = note.trim();
    this.persist();
    return true;
  }

  rename(serial: string, handle: string): boolean {
    const account = this.find(serial);
    if (!account) return false;
    account.handle = handle.trim() || 'tanpa nama';
    this.persist();
    return true;
  }

  remove(serial: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((a) => a.serial !== serial);
    this.persist();
    return this.items.length !== before;
  }

  clear(): void {
    this.items = [];
    this.persist();
  }

  filter(query: string, filter: OpsFilter = 'all'): OpsAccount[] {
    const needle = query.trim().toLowerCase();
    return this.all().filter((account) => {
      if (filter !== 'all' && statusOf(account) !== filter) return false;
      if (!needle) return true;
      return (
        account.serial.toLowerCase().includes(needle) ||
        account.handle.toLowerCase().includes(needle) ||
        account.note.toLowerCase().includes(needle) ||
        account.key.toLowerCase().includes(needle)
      );
    });
  }

  stats(now = Date.now()): OpsStats {
    const stats: OpsStats = {
      total: this.items.length,
      active: 0,
      expiring: 0,
      expired: 0,
      revoked: 0,
      revenue: 0,
    };
    for (const account of this.items) {
      stats[statusOf(account, now)] += 1;
      if (!account.revoked) stats.revenue += account.passes * PRICE;
    }
    return stats;
  }

  /** Serials that should be handed to the revocation workflow. */
  revokedSerials(): string[] {
    return this.items.filter((a) => a.revoked).map((a) => a.serial);
  }

  exportJson(): string {
    return JSON.stringify({ version: 1, exported: Date.now(), accounts: this.items }, null, 2);
  }

  importJson(raw: string): number {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return 0;
    }
    const accounts = Array.isArray(parsed)
      ? parsed
      : (parsed as { accounts?: unknown })?.accounts;
    if (!Array.isArray(accounts)) return 0;
    let merged = 0;
    for (const entry of accounts) {
      const account = entry as Partial<OpsAccount>;
      if (!account?.key || typeof account.key !== 'string') continue;
      if (this.add({ key: account.key, handle: account.handle, note: account.note })) merged += 1;
    }
    return merged;
  }

  toCsv(): string {
    const head = ['serial', 'nama', 'tier', 'kunci', 'mulai', 'berakhir', 'hari', 'status', 'catatan'];
    const rows = this.all().map((a) => [
      a.serial,
      a.handle,
      a.tier,
      a.key,
      new Date(a.issued).toISOString().slice(0, 10),
      new Date(a.expires).toISOString().slice(0, 10),
      String(dayCount(a.expires)),
      statusOf(a),
      a.note,
    ]);
    return [head, ...rows].map((cells) => cells.map(csvCell).join(',')).join('\n');
  }
}

function csvCell(value: string): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function isAccount(value: unknown): value is OpsAccount {
  const a = value as Partial<OpsAccount>;
  return Boolean(a && typeof a.serial === 'string' && typeof a.key === 'string' && typeof a.expires === 'number');
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export const ledger = new Ledger();
