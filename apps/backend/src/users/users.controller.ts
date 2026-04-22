import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('leaderboard')
  leaderboard(@Query('limit') limit?: string) {
    return this.users.topRated(limit ? Math.min(100, Number(limit)) : 25);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const u = await this.users.findById(id);
    if (!u) throw new NotFoundException();
    const { passwordHash, ...rest } = u;
    void passwordHash;
    return rest;
  }

  @Get(':id/games')
  games(@Param('id') id: string) {
    return this.users.recentGames(id);
  }
}
