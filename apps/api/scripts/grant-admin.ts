/**
 * Grants administrator access to a person who already has, or should have, an account.
 *
 * Written as a script rather than an admin screen because the first administrator cannot be
 * created from inside the admin console — somebody has to be able to sign in before anybody
 * can be promoted. After this, further administrators should be granted through the console
 * so the action is audited like every other privileged change.
 *
 * The account keeps REGISTERED_USER alongside ADMINISTRATOR. That is deliberate: an operator
 * who can only see the admin console cannot check what a buyer actually sees, and a platform
 * whose staff never use it as a user stops noticing when it breaks.
 *
 * The password is never passed on the command line — an argument is visible in the process
 * list to every other user on a shared host, and this box runs other people's applications.
 * It is read from LOCZ_ADMIN_PASSWORD instead.
 *
 *   cd apps/api
 *   LOCZ_ADMIN_PASSWORD='...' npx ts-node scripts/grant-admin.ts \
 *     --email someone@example.com --phone +919999999999 --name 'Their Name'
 */

import { NestFactory } from '@nestjs/core';
import { RoleName, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { v7 as uuid } from 'uuid';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/** Roles the account ends up with. Both, for the reason in the file comment. */
const ROLES: RoleName[] = [RoleName.ADMINISTRATOR, RoleName.REGISTERED_USER];

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const email = argument('email')?.trim().toLowerCase();
  const phone = argument('phone')?.trim();
  const displayName = argument('name')?.trim() ?? 'Administrator';
  const password = process.env.LOCZ_ADMIN_PASSWORD;

  if (!email || !phone) {
    throw new Error('Both --email and --phone are required');
  }
  if (!/^\+91\d{10}$/.test(phone)) {
    throw new Error(`--phone must be E.164, for example +919966577659 (got ${phone})`);
  }
  if (!password || password.length < 12) {
    throw new Error('LOCZ_ADMIN_PASSWORD must be set and at least 12 characters');
  }

  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const prisma = context.get(PrismaService);

    // Matched on either identifier: the person may already have signed up with one of them,
    // and creating a second account would leave them with two identities and one of them
    // holding the listings.
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phoneE164: phone }], deletedAt: null },
    });

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { email, phoneE164: phone, passwordHash, status: UserStatus.ACTIVE },
        })
      : await prisma.user.create({
          data: {
            id: uuid(),
            email,
            phoneE164: phone,
            displayName,
            passwordHash,
            status: UserStatus.ACTIVE,
            preferredLanguage: 'EN',
          },
        });

    console.log(existing ? `Updated existing account ${user.id}` : `Created account ${user.id}`);

    for (const name of ROLES) {
      const role = await prisma.role.findUnique({ where: { name } });
      if (!role) {
        console.error(`  ! role ${name} is missing — run the seed first`);
        continue;
      }

      // Idempotent: running this twice must not fail, and re-running is the normal way to
      // reset a forgotten password.
      const held = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId: role.id },
      });
      if (held) {
        console.log(`  already has ${name}`);
        continue;
      }

      // UserRole has a composite primary key of (userId, roleId) and no id column — the
      // key doubles as the constraint that a role cannot be granted twice.
      await prisma.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });
      console.log(`  granted ${name}`);
    }

    console.log('\nSign in at https://admin.locz.in with the email, and in the app with the number.');
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
