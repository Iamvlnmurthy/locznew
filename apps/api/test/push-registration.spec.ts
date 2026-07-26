import { NotFoundException } from '@nestjs/common';
import { AuditService } from '../src/audit/audit.service';
import { TokenService } from '../src/auth/token.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RbacService } from '../src/rbac/rbac.service';
import { UsersService } from '../src/users/users.service';
import { makePrismaMock } from './factories';

describe('push-token registration', () => {
  const prisma = makePrismaMock();
  const service = new UsersService(
    prisma as unknown as PrismaService,
    {} as RbacService,
    {} as AuditService,
    {} as TokenService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('updates only the signed-in user installation and refreshes last-seen time', async () => {
    (prisma.device.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    await service.updatePushToken('user-1', 'device-install-1', 'fcm-token-1');

    expect(prisma.device.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deviceKey: 'device-install-1' },
      data: {
        pushToken: 'fcm-token-1',
        lastSeenAt: expect.any(Date),
      },
    });
  });

  it('does not attach a token to an unknown or another user’s installation', async () => {
    (prisma.device.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    await expect(
      service.updatePushToken('user-1', 'not-this-users-device', 'fcm-token-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
