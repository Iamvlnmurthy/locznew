import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v7 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  actorId?: string;
  actorRole?: string;
  changes?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

/**
 * Append-only trail for anything a moderator, administrator or security reviewer might
 * later need to reconstruct.
 *
 * Writes are deliberately non-throwing: an audit failure must never roll back or block
 * the user-facing action it describes. Failures are logged loudly instead.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  /** Field names whose values are never written to the trail. */
  private static readonly REDACTED = new Set([
    'password',
    'passwordHash',
    'refreshToken',
    'refreshTokenHash',
    'codeHash',
    'accessToken',
    'otp',
    'code',
  ]);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: uuid(),
          actorId: entry.actorId ?? null,
          actorRole: entry.actorRole ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          changes: entry.changes
            ? (this.redact(entry.changes) as Prisma.InputJsonValue)
            : undefined,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent?.slice(0, 255) ?? null,
          correlationId: entry.correlationId ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit entry ${entry.action} on ${entry.entityType}:${entry.entityId ?? '-'}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private redact(changes: Record<string, unknown>): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(changes)) {
      if (AuditService.REDACTED.has(key)) {
        output[key] = '[redacted]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        output[key] = this.redact(value as Record<string, unknown>);
      } else {
        output[key] = value;
      }
    }
    return output;
  }

  /**
   * Diff helper — records only the fields that actually changed, so an audit row
   * stays readable instead of restating an entire entity.
   */
  diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const from = before[key];
      const to = after[key];
      if (JSON.stringify(from) !== JSON.stringify(to)) {
        changes[key] = { from, to };
      }
    }
    return changes;
  }
}
