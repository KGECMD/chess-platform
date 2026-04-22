import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GamesModule } from './games/games.module';
import { EngineModule } from './engine/engine.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthController } from './common/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Two tiers: generous default, stricter on engine endpoints (set per-controller).
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 240 },
      { name: 'engine', ttl: 60_000, limit: 30 },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    EngineModule,
    MatchmakingModule,
    GamesModule,
    GatewayModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
