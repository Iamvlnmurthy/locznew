import { Global, Module } from '@nestjs/common';
import { SitemapNotifyService } from './sitemap-notify.service';

@Global()
@Module({
  providers: [SitemapNotifyService],
  exports: [SitemapNotifyService],
})
export class SeoModule {}
