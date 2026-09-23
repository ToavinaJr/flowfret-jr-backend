import { Module } from '@nestjs/common';
import { UserRelationsResolver } from './user-relations.resolver';
import { UsersResolver } from './users.resolver';
import { UsersService } from './users.service';

@Module({
  providers: [UsersResolver, UserRelationsResolver, UsersService],
})
export class UsersModule {}
