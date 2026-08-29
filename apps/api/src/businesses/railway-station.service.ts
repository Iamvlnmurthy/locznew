import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Enriches a railway-station business with its station code and the trains that serve it, from the
 * public Indian Railways schedule. Conservative by design: only when the business name resolves to
 * exactly ONE station code is anything shown (never guess which "Delhi" station a page means), and
 * only stable facts are surfaced — the station CODE and each train's number/name/route. Arrival times
 * from the source schedule are deliberately NOT shown; they go stale, and a wrong time erodes trust.
 */
export interface RailwayTrain {
  number: string;
  name: string;
  from: string | null;
  to: string | null;
}

export interface RailwayInfo {
  stationCode: string;
  stationName: string;
  trains: RailwayTrain[];
  trainCount: number;
}

const GEN = new Set(
  'railway station junction jn the new old road city town east west north south main'.split(' '),
);
const IS_STATION = /\brailway\s*station\b|\bjunction\b/i;
// A business that merely SITS near a station (a hotel, lodge, PG, shop) is not the station itself.
// These words mean "near/at a station", so the page must not claim to be the station.
const NOT_STATION =
  /\b(hotel|lodge|lodging|resort|inn|restaurant|cafe|bar|hostel|pg|residency|residence|guest|stay|rooms?|near|opp|opposite|behind|beside|hospital|clinic|apartment|flats?|shop|store|parking|cyber|xerox|tiffin|mess|dhaba)\b/i;
const TRAIN_CAP = 12;

@Injectable()
export class RailwayStationService {
  private available: boolean | null = null;
  constructor(private readonly prisma: PrismaService) {}

  private async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      await this.prisma.$queryRawUnsafe(`SELECT 1 FROM railway_stops LIMIT 1`);
      this.available = true;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  private titleCase(s: string): string {
    return s
      .toLowerCase()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase())
      .replace(/\s+/g, ' ')
      .trim();
  }

  async enrich(input: { name: string }): Promise<RailwayInfo | null> {
    if (!IS_STATION.test(input.name) || NOT_STATION.test(input.name)) return null;
    if (!(await this.isAvailable())) return null;

    const core = input.name.replace(/railway\s*station|junction/gi, ' ');
    const toks = [
      ...new Set(
        core
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .split(' ')
          .filter((w) => w.length >= 4 && !GEN.has(w)),
      ),
    ].slice(0, 5);
    if (!toks.length) return null;

    // Resolve to a SINGLE station code — otherwise we can't say which station this is, so show nothing.
    const like = toks.map((_, i) => `lower(station_name) LIKE $${i + 1}`).join(' OR ');
    const codes = await this.prisma.$queryRawUnsafe<
      Array<{ station_code: string; station_name: string }>
    >(
      `SELECT station_code, min(station_name) AS station_name FROM railway_stops
       WHERE ${like} GROUP BY station_code LIMIT 3`,
      ...toks.map((t) => `%${t}%`),
    );
    if (codes.length !== 1) return null;
    const station = codes[0];
    if (!station) return null;

    // Trains serving the station — number, name, route. Stable facts only, no times.
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ train_no: string; train_name: string; src_name: string; dst_name: string }>
    >(
      `SELECT DISTINCT train_no, train_name, src_name, dst_name FROM railway_stops
       WHERE station_code = $1 ORDER BY train_no LIMIT ${TRAIN_CAP + 1}`,
      station.station_code,
    );
    const trains: RailwayTrain[] = rows.slice(0, TRAIN_CAP).map((r) => ({
      number: r.train_no,
      name: this.titleCase(r.train_name ?? ''),
      from: r.src_name ? this.titleCase(r.src_name) : null,
      to: r.dst_name ? this.titleCase(r.dst_name) : null,
    }));

    const countRows = await this.prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(DISTINCT train_no)::bigint AS n FROM railway_stops WHERE station_code = $1`,
      station.station_code,
    );

    return {
      stationCode: station.station_code,
      stationName: this.titleCase(station.station_name ?? ''),
      trains,
      trainCount: Number(countRows[0]?.n ?? trains.length),
    };
  }
}
