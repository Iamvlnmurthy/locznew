import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../rbac/rbac.decorators';
import { BankBranchService } from './bank-branch.service';

/**
 * Public read API for the dedicated per-branch IFSC pages (`/ifsc/[code]`), served straight from the
 * authoritative RBI/razorpay `bank_branches` table. Read-only, cacheable, no auth.
 */
@ApiTags('banks')
@Controller('banks')
export class BanksController {
  constructor(private readonly bankBranches: BankBranchService) {}

  @Public()
  @Get('ifsc-sitemap/count')
  @ApiOperation({ summary: 'Total IFSC branches, for sizing the IFSC sitemap shards' })
  async sitemapCount(): Promise<{ total: number }> {
    return { total: await this.bankBranches.ifscCount() };
  }

  @Public()
  @Get('ifsc-sitemap')
  @ApiOperation({ summary: 'A page of IFSC codes for one XML sitemap shard' })
  async sitemapPage(
    @Query('page') page = '0',
    @Query('pageSize') pageSize = '10000',
  ): Promise<{ codes: string[] }> {
    const p = Math.max(0, Number(page) || 0);
    const size = Math.min(Math.max(1, Number(pageSize) || 10000), 10000);
    return { codes: await this.bankBranches.ifscSitemapPage(p, size) };
  }

  @Public()
  @Get('ifsc/:code')
  @ApiOperation({
    summary: 'One bank branch by IFSC, with other branches of the same bank in its city',
  })
  async byIfsc(@Param('code') code: string) {
    return this.bankBranches.getByIfsc(code.trim());
  }
}
