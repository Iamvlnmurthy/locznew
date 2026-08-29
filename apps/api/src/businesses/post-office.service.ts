import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Turns a post-office business into AUTHORITATIVE India Post details from the `post_offices` table
 * (loaded from the government post-office directory). Same discipline as bank IFSC pages: the official
 * record is the source of truth, matched by PINCODE (which post offices are defined by) plus name.
 *  - `matched`  — the business name resolves to exactly one office in its pincode: that office's type,
 *                 delivery status, division/region/circle and coordinates become the page's facts.
 *  - `offices`  — otherwise, the authoritative list of post offices in the pincode, so the reader finds
 *                 theirs. Nothing is ever guessed.
 */
export interface PostOfficeRecord {
  officeName: string;
  pincode: string;
  officeType: string; // "Head Office" | "Sub Office" | "Branch Office"
  delivery: string | null; // "Delivery" | "Non-Delivery"
  division: string | null;
  region: string | null;
  circle: string | null;
  district: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface PostOfficeInfo {
  matched: PostOfficeRecord | null;
  offices: PostOfficeRecord[];
  officeCount: number;
  pincode: string | null;
  areaLabel: string | null;
}

const OFFICE_TYPE: Record<string, string> = {
  HO: 'Head Office',
  SO: 'Sub Office',
  PO: 'Sub Office',
  BO: 'Branch Office',
};
const GENERIC = new Set(
  'post office branch sub head india the of and city town village'.split(' '),
);
const LIST_CAP = 16;
// "post office", "sub post office", "branch post office", or the India Post suffixes S.O/B.O/H.O.
const IS_POST_OFFICE = /\bpost[\s-]?office\b|\b[sbh]\.?o\b/i;

@Injectable()
export class PostOfficeService {
  private readonly logger = new Logger(PostOfficeService.name);
  private available: boolean | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      await this.prisma.$queryRawUnsafe(`SELECT 1 FROM post_offices LIMIT 1`);
      this.available = true;
    } catch {
      this.available = false; // table absent (fresh env) — enrichment switches off silently
    }
    return this.available;
  }

  private hintTokens(name: string): string[] {
    return [
      ...new Set(
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .split(' ')
          .filter((w) => w.length >= 4 && !GENERIC.has(w)),
      ),
    ];
  }

  private toRecord(r: Record<string, unknown>): PostOfficeRecord {
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    const type = String(r.officetype ?? '').toUpperCase();
    return {
      officeName: (r.officename as string) ?? '',
      pincode: (r.pincode as string) ?? '',
      officeType: OFFICE_TYPE[type] ?? 'Post Office',
      delivery: (r.delivery as string) ?? null,
      division: (r.divisionname as string) ?? null,
      region: (r.regionname as string) ?? null,
      circle: (r.circlename as string) ?? null,
      district: (r.district as string) ?? null,
      state: (r.statename as string) ?? null,
      latitude: Number.isFinite(lat) && lat >= 6 && lat <= 38 ? lat : null,
      longitude: Number.isFinite(lng) && lng >= 68 && lng <= 98 ? lng : null,
    };
  }

  async enrich(input: { name: string; pincode?: string | null }): Promise<PostOfficeInfo | null> {
    if (!IS_POST_OFFICE.test(input.name)) return null;
    if (!(await this.isAvailable())) return null;
    const pin = (input.pincode ?? '').trim();
    if (!/^\d{6}$/.test(pin)) return null; // a post office page is only authoritative with its pincode

    const SELECT = `SELECT officename, pincode, officetype, delivery, divisionname, regionname, circlename, district, statename, latitude, longitude FROM post_offices`;

    // 1) PIN the exact office: a locality token from the name that resolves to ONE office in the pincode.
    let matched: PostOfficeRecord | null = null;
    const hints = this.hintTokens(input.name).slice(0, 6);
    if (hints.length) {
      const like = hints.map((_, i) => `lower(officename) LIKE $${i + 2}`).join(' OR ');
      const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `${SELECT} WHERE pincode = $1 AND (${like}) LIMIT 3`,
        pin,
        ...hints.map((h) => `%${h}%`),
      );
      const only = rows[0];
      if (rows.length === 1 && only) matched = this.toRecord(only);
    }

    // 2) The authoritative list of offices in this pincode.
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `${SELECT} WHERE pincode = $1 ORDER BY
         CASE upper(officetype) WHEN 'HO' THEN 0 WHEN 'SO' THEN 1 WHEN 'PO' THEN 1 ELSE 2 END,
         officename ASC LIMIT ${LIST_CAP + 1}`,
      pin,
    );
    const offices = rows.slice(0, LIST_CAP).map((r) => this.toRecord(r));
    const areaLabel = matched?.district ?? offices[0]?.district ?? null;

    if (!matched && !offices.length)
      return { matched: null, offices: [], officeCount: 0, pincode: pin, areaLabel: null };
    return {
      matched,
      offices,
      officeCount: rows.length > LIST_CAP ? offices.length + 1 : offices.length,
      pincode: pin,
      areaLabel: areaLabel ? this.titleCase(areaLabel) : null,
    };
  }

  private titleCase(s: string): string {
    return s
      .toLowerCase()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase())
      .trim();
  }
}
