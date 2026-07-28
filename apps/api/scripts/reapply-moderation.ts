/**
 * Re-runs the automated moderation rules over everything waiting for a human, and releases
 * whatever the current rules would now publish on their own.
 *
 * A moderation queue accumulates listings judged under whatever the rules said on the day
 * they were posted. When the rules are relaxed, that backlog does not move: those listings
 * are waiting on a person, and the person is waiting on a queue that only grows. The first
 * time this was needed, a clean listing had been sitting for twenty hours because every new
 * account's first post went to review regardless of content.
 *
 * Deliberately conservative:
 *
 *  - It only ever *releases*. A listing the rules would now reject or still hold is left
 *    exactly where it is — a script that started rejecting a backlog unattended would be
 *    making content decisions nobody asked it to make.
 *  - It goes through `approveListing`, so the audit trail, the moderation action and the
 *    search index all happen the way they do for a human approval. Editing the rows directly
 *    would leave a listing published but unfindable, which looks fine in the database and
 *    broken to the person who posted it.
 *  - `--dry-run` prints the verdicts and changes nothing.
 *
 * Usage, from the repository root:
 *
 *   npx tsx apps/api/scripts/reapply-moderation.ts --dry-run
 *   npx tsx apps/api/scripts/reapply-moderation.ts
 */

import { NestFactory } from '@nestjs/core';
import { ListingStatus, ModerationDecision } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ModerationService } from '../src/moderation/moderation.service';
import { RuleBasedModerationProvider } from '../src/moderation/rule-based-moderation.provider';

/** Attributed to the rules rather than to a person, because no person looked at these. */
const ACTOR = 'system:reapply-moderation';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const context = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const prisma = context.get(PrismaService);
    const moderation = context.get(ModerationService);
    const rules = context.get(RuleBasedModerationProvider);

    const waiting = await prisma.listing.findMany({
      where: { status: ListingStatus.PENDING_REVIEW, deletedAt: null },
      include: { marketplace: true },
      orderBy: { createdAt: 'asc' },
    });

    if (waiting.length === 0) {
      console.log('Nothing is waiting for review.');
      return;
    }

    console.log(`${waiting.length} listing(s) waiting for review${dryRun ? ' (dry run)' : ''}\n`);
    let released = 0;

    for (const listing of waiting) {
      // Counted per listing rather than once up front: releasing one listing changes its
      // owner's published count, and the next listing by that owner must be judged against
      // the count as it will actually be, not as it was when the script started.
      const ownerPublishedCount = await prisma.listing.count({
        where: { ownerId: listing.ownerId, status: ListingStatus.PUBLISHED, deletedAt: null },
      });

      const duplicate = await prisma.listing.findFirst({
        where: {
          ownerId: listing.ownerId,
          title: listing.title,
          id: { not: listing.id },
          deletedAt: null,
        },
        select: { id: true },
      });

      const verdict = await rules.evaluate({
        listingId: listing.id,
        ownerId: listing.ownerId,
        type: listing.type,
        title: listing.title,
        description: listing.description ?? '',
        price: listing.marketplace?.price ? Number(listing.marketplace.price) : null,
        ownerPublishedCount,
        isDuplicate: Boolean(duplicate),
      });

      const reasons = verdict.reasons.join(', ') || 'none';
      const wouldRelease = verdict.decision === ModerationDecision.AUTO_APPROVE;

      console.log(
        `${wouldRelease ? 'release' : 'hold   '}  ${listing.id}  score=${verdict.score}  ` +
          `"${listing.title}"  [${reasons}]`,
      );

      if (!wouldRelease) continue;
      released += 1;
      if (dryRun) continue;

      await moderation.approveListing(
        listing.id,
        ACTOR,
        `Released by reapply-moderation: rules now score ${verdict.score} [${reasons}]`,
      );
    }

    console.log(`\n${dryRun ? 'Would release' : 'Released'} ${released} of ${waiting.length}.`);
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
