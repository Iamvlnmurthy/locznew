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
  }): Promise<BankingInfo | null> {
    const names = await this.loadBankNames();
    if (!names.length) return null;
    const bank = this.identifyBank(input.name, names);
    if (!bank) return null;

    const area = (input.city ?? '').trim();
    const SELECT = `SELECT ifsc, bank, branch, address, city, district, state, micr, contact, neft, rtgs, imps, upi FROM bank_branches`;

    // 1) Try to PIN a single branch: a locality token from the name that resolves to exactly ONE
    //    branch in the bank's city. Unique substring match only — this is the trust-critical path.
    let matched: BankBranchRecord | null = null;
    const hints = [input.locality, input.name]
      .filter(Boolean)
      .flatMap((s) => this.hintTokens(String(s), bank));
    if (area && hints.length) {
      const uniqueHints = [...new Set(hints)].slice(0, 6);
      const like = uniqueHints.map((_, i) => `lower(branch) LIKE $${i + 3}`).join(' OR ');
      const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `${SELECT} WHERE lower(bank) = lower($1) AND lower(city) = lower($2) AND (${like}) LIMIT 3`,
        bank,
        area,
        ...uniqueHints.map((h) => `%${h}%`),
      );
      const only = rows[0];
      if (rows.length === 1 && only) matched = this.toRecord(only);
    }

    // 2) The authoritative city/district branch list — what the page is built around when unpinned.
    let branches: BankBranchRecord[] = [];
    let branchCount = 0;
    let areaLabel: string | null = null;
    if (area) {
      const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `${SELECT} WHERE lower(bank) = lower($1) AND (lower(city) = lower($2) OR lower(district) = lower($2))
         ORDER BY branch ASC LIMIT ${LIST_CAP + 1}`,
        bank,
        area,
      );
      branches = rows.slice(0, LIST_CAP).map((r) => this.toRecord(r));
      branchCount = rows.length; // capped indicator; exact count fetched below only if needed
      if (branches.length) areaLabel = area;
      if (rows.length > LIST_CAP) {
        const c = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*)::bigint AS n FROM bank_branches WHERE lower(bank) = lower($1) AND (lower(city) = lower($2) OR lower(district) = lower($2))`,
          bank,
          area,
        );
        branchCount = Number(c[0]?.n ?? branches.length);
      }
    }

    // Nothing authoritative to add (obscure bank / no city match) — don't render an empty block.
    if (!matched && !branches.length)
      return { bankName: bank, matched: null, branches: [], branchCount: 0, areaLabel: null };
    return { bankName: bank, matched, branches, branchCount, areaLabel };
  }
}
