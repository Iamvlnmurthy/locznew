import { NotFoundException } from '@nestjs/common';
import { NewsController } from '../src/news/news.controller';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Auto-ingested news had no takedown — a bad headline could not be removed. Takedown is a soft
 * hide (removedAt + who), reversible; the feed and detail queries exclude removed events.
 */
describe('NewsController takedown', () => {
  const user = { id: 'mod-1' } as never;
  const make = (updateCount: number) => {
    const updateMany = jest.fn().mockResolvedValue({ count: updateCount });
    const prisma = { newsEvent: { updateMany } } as unknown as PrismaService;
    const controller = new NewsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      prisma,
    );
    return { controller, updateMany };
  };

  it('takedown stamps removedAt + removedBy on a live event', async () => {
    const { controller, updateMany } = make(1);
    await expect(controller.takedown('gachibowli-collapse', user)).resolves.toEqual({
      removed: true,
    });
    const [args] = updateMany.mock.calls[0];
    expect(args.where).toEqual({ slug: 'gachibowli-collapse', removedAt: null });
    expect(args.data.removedAt).toBeInstanceOf(Date);
    expect(args.data.removedBy).toBe('mod-1');
  });

  it('takedown 404s an event that is missing or already removed', async () => {
    const { controller } = make(0);
    await expect(controller.takedown('gone', user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('restore clears removedAt only on a removed event', async () => {
    const { controller, updateMany } = make(1);
    await expect(controller.restore('gachibowli-collapse')).resolves.toEqual({ restored: true });
    const [args] = updateMany.mock.calls[0];
    expect(args.where).toEqual({ slug: 'gachibowli-collapse', removedAt: { not: null } });
    expect(args.data).toEqual({ removedAt: null, removedBy: null });
  });
});
