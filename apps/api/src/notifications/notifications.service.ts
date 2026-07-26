import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { v7 as uuid } from 'uuid';
import { PaginatedDto, paginate } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_SEND_NOTIFICATION, QUEUE_NOTIFICATIONS } from '../queue/queue.constants';
import { NotificationDto, NotificationPreferenceDto } from './dto/notification.dto';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Channels to attempt beyond in-app. Defaults to push. */
  channels?: NotificationChannel[];
}

/**
 * One entry point for every notification in the platform.
 *
 * In-app rows are written synchronously so the bell icon is correct immediately;
 * delivery over push, email or SMS is queued, because a slow FCM call must never
 * lengthen the request that triggered it.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NOTIFICATIONS) private readonly queue: Queue,
  ) {}

  async create(input: CreateNotificationInput): Promise<void> {
    const inApp = await this.prisma.notification.create({
      data: {
        id: uuid(),
        userId: input.userId,
        type: input.type,
        channel: NotificationChannel.IN_APP,
        title: input.title,
        body: input.body,
        data: (input.data ?? {}) as Prisma.InputJsonValue,
        sentAt: new Date(),
      },
    });

    const channels = input.channels ?? [NotificationChannel.PUSH];

    for (const channel of channels) {
      if (channel === NotificationChannel.IN_APP) continue;

      // A user who turned this off gets nothing on that channel — preferences are
      // checked before the job is queued, not after it has already sent.
      if (!(await this.isEnabled(input.userId, input.type, channel))) continue;

      const queued = await this.prisma.notification.create({
        data: {
          id: uuid(),
          userId: input.userId,
          type: input.type,
          channel,
          title: input.title,
          body: input.body,
          data: (input.data ?? {}) as Prisma.InputJsonValue,
        },
      });

      try {
        await this.queue.add(JOB_SEND_NOTIFICATION, { notificationId: queued.id });
      } catch (error) {
        this.logger.error(
          `Could not queue ${channel} delivery for ${queued.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    void inApp;
  }

  /**
   * Creates only if an equivalent unread notification does not already exist. Used by
   * the recurring jobs so a daily sweep does not send the same warning every day.
   *
   * Returns whether a notification was actually created.
   */
  async createOnce(input: CreateNotificationInput): Promise<boolean> {
    const entityId = input.data?.entityId;

    const existing = await this.prisma.notification.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        readAt: null,
        ...(entityId
          ? { data: { path: ['entityId'], equals: entityId as Prisma.InputJsonValue } }
          : {}),
      },
    });

    if (existing) return false;

    await this.create(input);
    return true;
  }

  async isEnabled(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel,
  ): Promise<boolean> {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId_type_channel: { userId, type, channel } },
    });
    // Absent preference means "not yet decided" — the platform default applies, which is
    // on for everything except SMS. SMS costs money and is reserved for critical messages.
    if (!preference) return channel !== NotificationChannel.SMS;
    return preference.enabled;
  }

  async list(
    userId: string,
    page: number,
    limit: number,
    unreadOnly = false,
  ): Promise<PaginatedDto<NotificationDto>> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      channel: NotificationChannel.IN_APP,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    const items: NotificationDto[] = notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: (notification.data as Record<string, unknown>) ?? {},
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    }));

    return paginate(items, total, page, limit);
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, channel: NotificationChannel.IN_APP, readAt: null },
    });
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.notification.findFirst({
        where: { id: notificationId, userId },
      });
      if (!exists) throw new NotFoundException('Notification not found');
    }
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async listPreferences(userId: string): Promise<NotificationPreferenceDto[]> {
    const stored = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const byKey = new Map(stored.map((entry) => [`${entry.type}:${entry.channel}`, entry.enabled]));

    // Every type/channel pair is returned, defaulted, so a settings screen can render
    // the full matrix without inventing its own defaults.
    const preferences: NotificationPreferenceDto[] = [];
    for (const type of Object.values(NotificationType)) {
      for (const channel of Object.values(NotificationChannel)) {
        preferences.push({
          type,
          channel,
          enabled: byKey.get(`${type}:${channel}`) ?? channel !== NotificationChannel.SMS,
        });
      }
    }
    return preferences;
  }

  async setPreference(
    userId: string,
    type: NotificationType,
    channel: NotificationChannel,
    enabled: boolean,
  ): Promise<void> {
    await this.prisma.notificationPreference.upsert({
      where: { userId_type_channel: { userId, type, channel } },
      update: { enabled },
      create: { id: uuid(), userId, type, channel, enabled },
    });
  }
}
