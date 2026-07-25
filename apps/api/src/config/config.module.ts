import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { Env, validateEnv } from './configuration';

/**
 * Typed wrapper around ConfigService. Every consumer injects this rather than
 * reading process.env, so the environment contract has exactly one enforcement point.
 */
export class AppConfig {
  constructor(private readonly config: ConfigService) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key as string) as Env[K];
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get isDevelopment(): boolean {
    return this.get('NODE_ENV') === 'development';
  }
}

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
  ],
  providers: [
    {
      provide: AppConfig,
      useFactory: (config: ConfigService) => new AppConfig(config),
      inject: [ConfigService],
    },
  ],
  exports: [AppConfig],
})
export class AppConfigModule {}
