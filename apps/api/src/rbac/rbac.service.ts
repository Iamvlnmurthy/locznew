import { Injectable, NotFoundException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ResolvedAccess {
  roles: RoleName[];
  permissions: string[];
}

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Flattens every role a user holds into one permission set. A user may hold several
   * roles (seller + employer + business owner is common), so permissions are unioned,
   * never taken from a single "primary" role.
   */
  async resolveAccess(userId: string): Promise<ResolvedAccess> {
    const assignments = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });

    const roles = assignments.map((assignment) => assignment.role.name);
    const permissions = [
      ...new Set(assignments.flatMap((assignment) => assignment.role.permissions)),
    ];

    return { roles, permissions };
  }

  async grantRole(userId: string, roleName: RoleName, grantedBy?: string): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new NotFoundException(`Role ${roleName} is not defined`);

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id, grantedBy },
    });
  }

  async revokeRole(userId: string, roleName: RoleName): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new NotFoundException(`Role ${roleName} is not defined`);

    await this.prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
  }

  /**
   * Posting privileges are granted on first use rather than asked for at sign-up —
   * a seller becomes a seller by posting something, not by filling in a form.
   */
  async ensureRole(userId: string, roleName: RoleName): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) return;

    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: role.id } },
    });
    if (!existing) {
      await this.prisma.userRole.create({ data: { userId, roleId: role.id } });
    }
  }
}
