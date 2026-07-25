import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingStatus, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { DeviceDto, UpdateProfileDto, UserProfileDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
  ) {}

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    const [access, publishedListingCount, savedListingCount] = await Promise.all([
      this.rbac.resolveAccess(userId),
      this.prisma.listing.count({
        where: { ownerId: userId, status: ListingStatus.PUBLISHED, deletedAt: null },
      }),
      this.prisma.savedListing.count({ where: { userId } }),
    ]);

    return {
      id: user.id,
      phone: user.phoneE164,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio,
      preferredLanguage: user.preferredLanguage,
      status: user.status,
      roles: access.roles,
      createdAt: user.createdAt,
      publishedListingCount,
      savedListingCount,
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    context: { ip?: string; correlationId?: string },
  ): Promise<UserProfileDto> {
    const existing = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!existing) throw new NotFoundException('User not found');

    if (dto.email && dto.email !== existing.email) {
      const taken = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (taken && taken.id !== userId) {
        throw new ConflictException('That email address is already in use');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: dto.displayName ?? undefined,
        // Changing the email drops its verified status — the new address is unproven.
        email: dto.email ?? undefined,
        emailVerifiedAt: dto.email && dto.email !== existing.email ? null : undefined,
        bio: dto.bio ?? undefined,
        preferredLanguage: dto.preferredLanguage ?? undefined,
      },
    });

    await this.audit.record({
      action: 'user.profile_update',
      entityType: 'User',
      entityId: userId,
      actorId: userId,
      changes: this.audit.diff(
        { displayName: existing.displayName, email: existing.email, bio: existing.bio },
        { displayName: updated.displayName, email: updated.email, bio: updated.bio },
      ),
      ip: context.ip,
      correlationId: context.correlationId,
    });

    return this.getProfile(userId);
  }

  async listDevices(userId: string, currentSessionId: string): Promise<DeviceDto[]> {
    const currentSession = await this.prisma.session.findUnique({
      where: { id: currentSessionId },
      select: { deviceId: true },
    });

    const devices = await this.prisma.device.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });

    return devices.map((device) => ({
      id: device.id,
      platform: device.platform,
      name: device.name,
      appVersion: device.appVersion,
      lastSeenAt: device.lastSeenAt,
      isCurrent: device.id === currentSession?.deviceId,
    }));
  }

  /**
   * Records a rotated FCM token. Firebase rotates tokens without warning, so the app
   * re-registers on every launch; the device is matched by its stable install key
   * rather than by the token itself.
   */
  async updatePushToken(userId: string, deviceKey: string, pushToken: string): Promise<void> {
    const result = await this.prisma.device.updateMany({
      where: { userId, deviceKey },
      data: { pushToken, lastSeenAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException('Device not registered — sign in again on this device');
    }
  }

  async revokeDevice(userId: string, deviceId: string): Promise<void> {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, userId } });
    if (!device) throw new NotFoundException('Device not found');

    await this.prisma.device.update({
      where: { id: deviceId },
      data: { revokedAt: new Date(), pushToken: null },
    });
    await this.tokens.revokeDevice(userId, deviceId, 'USER_REVOKED_DEVICE');

    await this.audit.record({
      action: 'user.device_revoke',
      entityType: 'Device',
      entityId: deviceId,
      actorId: userId,
    });
  }

  /**
   * Deactivation is reversible and hides the user's content without destroying it —
   * signing in again restores the account. Listings are paused rather than deleted so
   * a returning user does not lose their inventory.
   */
  async deactivate(userId: string, context: { ip?: string }): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.DEACTIVATED },
      }),
      this.prisma.listing.updateMany({
        where: { ownerId: userId, status: ListingStatus.PUBLISHED },
        data: { status: ListingStatus.PAUSED },
      }),
    ]);

    await this.tokens.revokeAllForUser(userId, 'ACCOUNT_DEACTIVATED');
    await this.audit.record({
      action: 'user.deactivate',
      entityType: 'User',
      entityId: userId,
      actorId: userId,
      ip: context.ip,
    });
  }

  /**
   * Deletion is a *request*, not an immediate purge: reports, moderation history and
   * conversations involving this user must survive for the dispute window. A scheduled
   * job anonymises the record after the retention period.
   */
  async requestDeletion(
    userId: string,
    reason: string | undefined,
    context: { ip?: string },
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.DELETION_REQUESTED, deletionRequestedAt: new Date() },
      }),
      this.prisma.listing.updateMany({
        where: { ownerId: userId, status: { in: [ListingStatus.PUBLISHED, ListingStatus.PAUSED] } },
        data: { status: ListingStatus.ARCHIVED },
      }),
    ]);

    await this.tokens.revokeAllForUser(userId, 'ACCOUNT_DELETION_REQUESTED');
    await this.audit.record({
      action: 'user.deletion_request',
      entityType: 'User',
      entityId: userId,
      actorId: userId,
      changes: { reason: reason ?? null },
      ip: context.ip,
    });
  }
}
