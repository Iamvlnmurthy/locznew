import { Queue } from 'bullmq';
import { AdminService } from '../src/admin/admin.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

/**
 * The demand-side admin metrics. `unansweredRequirements` is the number operations acts on —
 * open requirements nobody has answered — so its query must actually filter on responseCount 0,
 * not just count open ones.
 */
describe('AdminService demand metrics', () => {
  it('aggregates open / fulfilled / unanswered / responses / new-this-week', async () => {
    const brdCount = jest
      .fn()
      .mockResolvedValueOnce(5) // open
      .mockResolvedValueOnce(2) // fulfilled
      .mockResolvedValueOnce(3); // unanswered
    const prisma = {
      buyerRequirementDetail: { count: brdCount },
      requirementResponse: { count: jest.fn().mockResolvedValue(7) },
      listing: { count: jest.fn().mockResolvedValue(4) },
    } as unknown as PrismaService;

    const service = new AdminService(prisma, {} as RedisService, {} as Queue);
    const metrics = await service.getDemandMetrics();

    expect(metrics).toEqual({
      openRequirements: 5,
      fulfilledRequirements: 2,
      unansweredRequirements: 3,
      totalResponses: 7,
      newRequirementsThisWeek: 4,
    });
    // the supply-gap query must be the one that filters on zero responses
    expect(brdCount.mock.calls[2][0].where).toMatchObject({ responseCount: 0, fulfilledAt: null });
  });

  it('names unmet demand by category, mapping ids to labels', async () => {
    const prisma = {
      listing: {
        groupBy: jest.fn().mockResolvedValue([
          { categoryId: 'c1', _count: { _all: 3 } },
          { categoryId: 'c2', _count: { _all: 1 } },
        ]),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', name: 'Plumbers' },
          { id: 'c2', name: 'Tutors' },
        ]),
      },
    } as unknown as PrismaService;

    const service = new AdminService(prisma, {} as RedisService, {} as Queue);
    const rows = await service.getUnmetDemandByCategory(10);

    expect(rows).toEqual([
      { id: 'c1', label: 'Plumbers', count: 3 },
      { id: 'c2', label: 'Tutors', count: 1 },
    ]);
  });
});
