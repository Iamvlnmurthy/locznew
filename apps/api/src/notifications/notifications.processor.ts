import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  JOB_SEND_NOTIFICATION,
  QUEUE_NOTIFICATIONS,
  SendNotificationJob,
} from '../queue/queue.constants';
import { PushProvider } from './push.provider';

/**
 * Delivers queued notifications. Only push is wired for Phase 1; email and SMS rows are
 * recorded and marked as unsupported rather than silently dropped, so the gap is visible
 * in the database instead of invisible in the code.
 */
@Processor(QUEUE_NOTIFICATIONS, { concurrency: 10 })
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushProvider,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name !== JOB_SEND_NOTIFICATION) {
      this.logger.error(`Unknown job "${job.name}" on the ${QUEUE_NOTIFICATIONS} queue`);
      return undefined;
    }

    const { notificationId } = job.data as SendNotificationJob;

    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.sentAt) return { skipped: true };

    if (notification.channel !== NotificationChannel.PUSH) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          failedAt: new Date(),
          failureReason: `${notification.channel} delivery is not implemented in Phase 1`,
        },
      });
      return { delivered: false };
    }

    const devices = await this.prisma.device.findMany({
      where: { userId: notification.userId, revokedAt: null, pushToken: { not: null } },
    });

    if (devices.length === 0) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { failedAt: new Date(), failureReason: 'No registered device' },
      });
      return { delivered: false };
    }

    const data = (notification.data as Record<string, unknown>) ?? {};
    let delivered = 0;

    for (const device of devices) {
      const result = await this.push.send({
        token: device.pushToken!,
        title: notification.title,
        body: notification.body,
        data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])),
      });

      if (result.delivered) {
        delivered += 1;
      } else if (result.reason === 'token-unregistered') {
        // The app was uninstalled. Forget the token so it is not retried on every
        // future notification.
        await this.prisma.device.update({
          where: { id: device.id },
          data: { pushToken: null },
        });
      }
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data:
        delivered > 0
          ? { sentAt: new Date(), failedAt: null, failureReason: null }
          : { failedAt: new Date(), failureReason: 'No device accepted the message' },
    });

    return { delivered };
  }
}
