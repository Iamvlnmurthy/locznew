import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { BusinessesModule } from './businesses/businesses.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { ErrorReporter } from './common/monitoring/error-reporter';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { AppConfigModule } from './config/config.module';
import { CategoriesModule } from './categories/categories.module';
import { GeoModule } from './geo/geo.module';
import { HealthModule } from './health/health.module';
import { ConversationsModule } from './conversations/conversations.module';
import { FeedModule } from './feed/feed.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { ListingsModule } from './listings/listings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { QueueModule } from './queue/queue.module';
import { EmailModule } from './email/email.module';
import { RequirementsModule } from './requirements/requirements.module';
import { SearchSubscriptionsModule } from './search-subscriptions/search-subscriptions.module';
import { SearchModule } from './search/search.module';
import { MediaModule } from './media/media.module';
import { ModerationModule } from './moderation/moderation.module';
import { ReportsModule } from './reports/reports.module';
import { PrismaModule } from './prisma/prisma.module';
import { RetryAwareThrottlerGuard } from './common/guards/retry-aware-throttler.guard';
import { JwtAuthGuard } from './rbac/jwt-auth.guard';
import { PermissionsGuard } from './rbac/permissions.guard';
import { RbacModule } from './rbac/rbac.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    AuditModule,
    RbacModule,
    AuthModule,
    UsersModule,
    GeoModule,
    CategoriesModule,
    MediaModule,
    QueueModule,
    SearchModule,
    EmailModule,
    RequirementsModule,
    SearchSubscriptionsModule,
    NotificationsModule,
    ModerationModule,
    ListingsModule,
    FeedModule,
    ConversationsModule,
    BusinessesModule,
    ReportsModule,
    LifecycleModule,
    AdminModule,
    HealthModule,
    // Baseline API rate limit. Individual routes tighten it with @Throttle; the OTP
    // endpoints add their own per-phone limits on top.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: Number(process.env.RATE_LIMIT_TTL_SECONDS ?? 60) * 1000,
        limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 120),
      },
    ]),
  ],
  providers: [
    // Order matters: throttle before doing work, authenticate, then authorise.
    { provide: APP_GUARD, useClass: RetryAwareThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Idempotency runs before the response envelope so what is replayed is the
    // domain payload, not a re-wrapped envelope.
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ErrorReporter,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // '{*path}' rather than '*': path-to-regexp v8 requires named wildcards.
    consumer.apply(CorrelationIdMiddleware).forRoutes('{*path}');
  }
}
