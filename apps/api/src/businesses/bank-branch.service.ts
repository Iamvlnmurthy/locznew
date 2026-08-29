import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Turns a bank/ATM business into AUTHORITATIVE banking details, sourced entirely from the RBI
 * IFSC dataset (`bank_branches`, imported from razorpay/ifsc). The scraped business record is noisy;
 * the IFSC record is the stable source of truth, so a bank page is rebuilt from it rather than
 * stitched together — and we NEVER assert a specific IFSC unless it is unambiguously correct.
 *
 * Two safe outcomes:
 *  - `matched`  — the business name names a locality that resolves to exactly one branch in its city.
 *                 That branch (IFSC, MICR, address, services) becomes the page's canonical bank block.
 *  - `branches` — otherwise, the authoritative list of that bank's branches in the city/district, so
 *                 the visitor finds their exact IFSC themselves. No IFSC is ever guessed.
 */
export interface BankBranchRecord {
  ifsc: string;
  bank: string;
  branch: string;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  micr: string | null;
  contact: string | null;
  neft: boolean;
  rtgs: boolean;
  imps: boolean;
  upi: boolean;
}

export interface BankingInfo {
  bankName: string;
  /** The single authoritative branch, only when the match is unambiguous. */
  matched: BankBranchRecord | null;
  /** The bank's branches in this city/district — the safe fallback the page is built around. */
  branches: BankBranchRecord[];
  /** How many branches this bank has in the area (branches[] may be capped). */
  branchCount: number;
  /** The place the branch list is scoped to, for headings ("… in Hyderabad"). */
  areaLabel: string | null;
}

const GENERIC = new Set(
  'bank branch atm of the india indian ltd limited co main road opp near and'.split(' '),
);
const LIST_CAP = 14;

// Indian states/UTs, to catch the rare razorpay row whose structured city/district is right but whose
// free-text ADDRESS is stale and names a different state (e.g. a Nashik branch with a Gujarat address).
// Showing that under "… in Nashik" reads as wrong, so such a row is dropped from the list.
const STATE_NAMES = [
  'andhra pradesh',
  'arunachal',
  'assam',
  'bihar',
  'chhattisgarh',
  'goa',
  'gujarat',
  'haryana',
  'himachal',
  'jharkhand',
  'karnataka',
  'kerala',
  'madhya pradesh',
  'maharashtra',
  'manipur',
  'meghalaya',
  'mizoram',
  'nagaland',
  'odisha',
  'punjab',
  'rajasthan',
  'sikkim',
  'tamil nadu',
  'telangana',
  'tripura',
  'uttar pradesh',
  'uttarakhand',
  'west bengal',
  'delhi',
  'jammu',
  'kashmir',
  'chandigarh',
  'puducherry',
];

/** Title-case an ALL-CAPS razorpay place ("RANGA REDDY" → "Ranga Reddy") for display and keywords. */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

/** True unless the free-text address explicitly names a state other than the branch's own state. */
function addressMatchesState(address: string | null, state: string | null): boolean {
  if (!address || !state) return true;
  const a = address.toLowerCase();
  const own = state.toLowerCase();
  for (const s of STATE_NAMES) {
    if (own.includes(s)) continue; // the branch's own state — fine
    if (a.includes(s)) return false; // a different state named in the address — stale/mismatched row
  }
  return true;
}

@Injectable()
export class BankBranchService {
  private readonly logger = new Logger(BankBranchService.name);
  private bankNames: Array<[string, string]> | null = null; // [name, lowercased], longest-first

  constructor(private readonly prisma: PrismaService) {}

  /** Distinct bank names, loaded once and cached — used to recognise which bank a business is. */
  private async loadBankNames(): Promise<Array<[string, string]>> {
    if (this.bankNames) return this.bankNames;
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ bank: string }>>(
        `SELECT DISTINCT bank FROM bank_branches WHERE bank IS NOT NULL AND length(bank) > 2`,
      );
      this.bankNames = rows
        .map((r) => [r.bank, r.bank.toLowerCase()] as [string, string])
        .sort((a, b) => b[1].length - a[1].length); // longest name first — match "Bank of India" before "Bank"
    } catch (error) {
      // Table absent (e.g. a fresh env before the import) — banking enrichment simply switches off.
      this.logger.warn(`bank_branches unavailable, skipping banking enrichment: ${String(error)}`);
      this.bankNames = [];
    }
    return this.bankNames;
  }

  /**
   * Recognise the bank from a business name. Requires the FULL bank name to appear AND a bank/atm
   * token, so "State Bank Colony" or "Bank Street Cafe" never trip it.
   */
  private identifyBank(name: string, names: Array<[string, string]>): string | null {
    const nl = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
    if (!/ (bank|atm) /.test(nl)) return null;
    for (const [bank, lower] of names) {
      if (nl.includes(` ${lower} `) || nl.trim().startsWith(lower)) return bank;
    }
    return null;
  }

  /** Locality/branch tokens from the business name, once the bank name and filler words are removed. */
  private hintTokens(name: string, bank: string): string[] {
    const s = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(bank.toLowerCase(), ' ');
    return [...new Set(s.split(' ').filter((w) => w.length >= 4 && !GENERIC.has(w)))];
  }

  private toRecord(r: Record<string, unknown>): BankBranchRecord {
    return {
      ifsc: r.ifsc as string,
      bank: r.bank as string,
      branch: r.branch as string,
      address: (r.address as string) ?? null,
      city: (r.city as string) ?? null,
      district: (r.district as string) ?? null,
      state: (r.state as string) ?? null,
      micr: (r.micr as string) ?? null,
      contact: (r.contact as string) ?? null,
      neft: Boolean(r.neft),
      rtgs: Boolean(r.rtgs),
      imps: Boolean(r.imps),
      upi: Boolean(r.upi),
    };
  }

  async enrich(input: {
    name: string;
    city?: string | null;
    locality?: string | null;
    pincode?: string | null;
  }): Promise<BankingInfo | null> {
    const names = await this.loadBankNames();
    if (!names.length) return null;
    const bank = this.identifyBank(input.name, names);
    if (!bank) return null;

    const area = (input.city ?? '').trim();
    const pin = (input.pincode ?? '').trim();
    if (!area && !pin) return null;
    const SELECT = `SELECT ifsc, bank, branch, address, city, district, state, micr, contact, neft, rtgs, imps, upi FROM bank_branches`;

    // Area predicate: match by city/district NAME or by the business's exact pincode appearing in the
    // branch address. Pincode is essential because LocZ districts (e.g. "K.V.Rangareddy") don't match
    // razorpay's city names ("Hyderabad" / "Rangareddy") — the pincode ties a page to its real local
    // branches. `$1` is always the bank; area params begin at `$2`.
    const buildArea = (): { sql: string; params: string[] } => {
      const parts: string[] = [];
      const params: string[] = [];
      if (area) {
        params.push(area);
        const i = params.length + 1; // +1 for $1 = bank
        parts.push(`(lower(city) = lower($${i}) OR lower(district) = lower($${i}))`);
      }
      if (pin) {
        params.push(`%${pin}%`);
        parts.push(`address LIKE $${params.length + 1}`);
      }
      return { sql: parts.join(' OR '), params };
    };

    // 1) PIN a single branch: a locality token from the name that resolves to exactly ONE branch in
    //    the area. Unique substring match only — this is the trust-critical path.
    let matched: BankBranchRecord | null = null;
    const hints = [input.locality, input.name]
      .filter(Boolean)
      .flatMap((s) => this.hintTokens(String(s), bank));
    if (hints.length) {
      const uniqueHints = [...new Set(hints)].slice(0, 6);
      const ap = buildArea();
      const hintStart = 2 + ap.params.length;
      const like = uniqueHints.map((_, i) => `lower(branch) LIKE $${hintStart + i}`).join(' OR ');
      const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `${SELECT} WHERE lower(bank) = lower($1) AND (${ap.sql}) AND (${like}) LIMIT 3`,
        bank,
        ...ap.params,
        ...uniqueHints.map((h) => `%${h}%`),
      );
      const only = rows[0];
      if (rows.length === 1 && only) {
        matched = this.toRecord(only);
        // Keep the verified IFSC, but suppress a stale address that names a different state.
        if (!addressMatchesState(matched.address, matched.state)) matched.address = null;
      }
    }

    // 2) The authoritative area branch list — what the page is built around when unpinned.
    // Fetch a buffer beyond the cap so the two data-quality filters still leave a full list.
    const ap = buildArea();
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `${SELECT} WHERE lower(bank) = lower($1) AND (${ap.sql}) ORDER BY branch ASC LIMIT ${LIST_CAP + 10}`,
      bank,
      ...ap.params,
    );
    let clean = rows
      .map((r) => this.toRecord(r))
      .filter((b) => addressMatchesState(b.address, b.state));
    // Drop city/district mis-tags: a few razorpay rows carry the wrong city (e.g. a Maharashtra branch
    // tagged city="NAINITAL"), and their own `state` then disagrees with the rest. Keep only the
    // dominant state so a "… in Nainital" list never lists an out-of-state branch.
    const stateCounts = new Map<string, number>();
    for (const b of clean)
      if (b.state) stateCounts.set(b.state, (stateCounts.get(b.state) ?? 0) + 1);
    let domState: string | null = null;
    let domN = 0;
    for (const [s, n] of stateCounts)
      if (n > domN) {
        domN = n;
        domState = s;
      }
    if (domState) clean = clean.filter((b) => !b.state || b.state === domState);
    const branches = clean.slice(0, LIST_CAP);
    const branchCount = clean.length;
    // Label the area by the branches' own dominant city (razorpay's name people actually search —
    // "Hyderabad"), not the LocZ district ("K.V.Rangareddy", which nobody types into a search box).
    const cityCounts = new Map<string, number>();
    for (const b of branches) if (b.city) cityCounts.set(b.city, (cityCounts.get(b.city) ?? 0) + 1);
    let domCity: string | null = null;
    let domCityN = 0;
    for (const [ci, n] of cityCounts)
      if (n > domCityN) {
        domCityN = n;
        domCity = ci;
      }
    const areaLabel = branches.length ? (domCity ? titleCase(domCity) : area || null) : null;

    // Nothing authoritative to add (obscure bank / no area match) — don't render an empty block.
    if (!matched && !branches.length)
      return { bankName: bank, matched: null, branches: [], branchCount: 0, areaLabel: null };
    return { bankName: bank, matched, branches, branchCount, areaLabel };
  }

  private readonly SELECT_COLS = `ifsc, bank, branch, address, city, district, state, micr, contact, neft, rtgs, imps, upi`;

  /** A single branch by IFSC, plus other branches of the same bank in the same city (for a dedicated page). */
  async getByIfsc(
    ifsc: string,
  ): Promise<{ branch: BankBranchRecord; nearby: BankBranchRecord[] } | null> {
    if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc)) return null;
    if (!(await this.loadBankNames()).length) return null; // reuses the table-availability check
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT ${this.SELECT_COLS} FROM bank_branches WHERE upper(ifsc) = upper($1) LIMIT 1`,
      ifsc,
    );
    const row = rows[0];
    if (!row) return null;
    const branch = this.toRecord(row);
    if (!addressMatchesState(branch.address, branch.state)) branch.address = null;
    const nearbyRows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT ${this.SELECT_COLS} FROM bank_branches
       WHERE lower(bank) = lower($1) AND lower(city) = lower($2) AND upper(ifsc) <> upper($3)
       ORDER BY branch ASC LIMIT 12`,
      branch.bank,
      branch.city ?? '',
      ifsc,
    );
    const nearby = nearbyRows
      .map((r) => this.toRecord(r))
      .filter((b) => addressMatchesState(b.address, b.state));
    return { branch, nearby };
  }

  /** Total IFSC branches — sizes the sitemap shards. */
  async ifscCount(): Promise<number> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*)::bigint AS n FROM bank_branches`,
      );
      return Number(rows[0]?.n ?? 0);
    } catch {
      return 0;
    }
  }

  /** A page of IFSC codes for a sitemap shard (ordered by ifsc for stable pagination). */
  async ifscSitemapPage(page: number, pageSize: number): Promise<string[]> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ ifsc: string }>>(
        `SELECT ifsc FROM bank_branches ORDER BY ifsc ASC LIMIT $1 OFFSET $2`,
        pageSize,
        page * pageSize,
      );
      return rows.map((r) => r.ifsc);
    } catch {
      return [];
    }
  }
}
