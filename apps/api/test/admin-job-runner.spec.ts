import { BadRequestException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AdminService } from '../src/admin/admin.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

/**
 * `POST /admin/jobs/:name/run` takes a job name straight off the URL and puts it on a
 * queue. That is the whole risk: an endpoint that enqueues whatever it is handed is a
 * remote code path chosen by the caller, so the allowlist is pinned here rather than
 * left to review.
 */
describe('AdminService.runJob', () => {
  const queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) } as unknown as Queue;
  const prisma = {} as PrismaService;
  const redis = {} as RedisService;

  const service = new AdminService(prisma, redis, queue);

  beforeEach(() => {
    (queue.add as jest.Mock).mockClear();
  });

  it.each([
    'expire-listings',
    'warn-expiring',
    'sweep-orphan-media',
    'sweep-sessions',
    'trim-recently-viewed',
  ])('queues %s', async (name) => {
    const result = await service.runJob(name, 'admin-1');

    expect(result).toEqual({ queued: true, job: name });
    expect(queue.add).toHaveBeenCalledWith(
      name,
      { requestedBy: 'admin-1' },
      expect.objectContaining({ removeOnComplete: true }),
    );
  });

  it.each([
    'reindex-all',
    'drop-all-tables',
    'send-notification',
    '../../etc/passwd',
    '',
    'expire-listings ',
  ])('refuses %p rather than enqueueing it', async (name) => {
    await expect(service.runJob(name, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('names the runnable jobs when it refuses, so the caller can correct the request', async () => {
    await expect(service.runJob('nonsense', 'admin-1')).rejects.toThrow(/expire-listings/);
  });

  it('records who asked, because a manual sweep should be traceable to a person', async () => {
    await service.runJob('sweep-sessions', 'admin-42');

    expect(queue.add).toHaveBeenCalledWith(
      'sweep-sessions',
      { requestedBy: 'admin-42' },
      expect.anything(),
    );
  });

  it('uses a job id free of colons, which BullMQ rejects', async () => {
    await service.runJob('expire-listings', 'admin-1');

    const options = (queue.add as jest.Mock).mock.calls[0][2];
    expect(options.jobId).not.toContain(':');
    expect(options.jobId).toContain('expire-listings');
  });
});
