import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { GraphQLJSON } from 'graphql-type-json';
import { RateLimit } from '../auth/rate-limit.decorator';
import { Roles } from '../auth/roles.decorator';
import { AdminEntityService } from './admin-entity.service';
import {
  AdminManagedEntityConnection,
  AdminManagedEntityListInput,
  AdminManagedEntityMutationInput,
} from './admin-entity.types';

type AdminRequestContext = { req: { user: { sub: string } } };

@Roles(UserRole.ADMIN)
@Resolver()
export class AdminEntityResolver {
  constructor(private readonly entities: AdminEntityService) {}

  @Query(() => AdminManagedEntityConnection, { name: 'adminManagedEntities' })
  list(
    @Args('input') input: AdminManagedEntityListInput,
  ): Promise<AdminManagedEntityConnection> {
    return this.entities.list(
      input.entity,
      input.first,
      input.skip,
      input.includeDeleted,
    );
  }

  @RateLimit(30, 60, true)
  @Mutation(() => GraphQLJSON, { name: 'adminCreateManagedEntity' })
  create(
    @Args('input') input: AdminManagedEntityMutationInput,
    @Context() context: AdminRequestContext,
  ) {
    return this.entities.create(
      context.req.user.sub,
      input.entity,
      input.data,
      input.reason,
    );
  }

  @RateLimit(60, 60, true)
  @Mutation(() => GraphQLJSON, { name: 'adminUpdateManagedEntity' })
  update(
    @Args('input') input: AdminManagedEntityMutationInput,
    @Context() context: AdminRequestContext,
  ) {
    if (!input.recordId)
      throw new BadRequestException('ADMIN_ENTITY_ID_REQUIRED');
    return this.entities.update(
      context.req.user.sub,
      input.entity,
      input.recordId,
      input.data,
      input.reason,
    );
  }

  @RateLimit(20, 60, true)
  @Mutation(() => GraphQLJSON, { name: 'adminDeleteManagedEntity' })
  delete(
    @Args('input') input: AdminManagedEntityMutationInput,
    @Context() context: AdminRequestContext,
  ) {
    if (!input.recordId)
      throw new BadRequestException('ADMIN_ENTITY_ID_REQUIRED');
    return this.entities.delete(
      context.req.user.sub,
      input.entity,
      input.recordId,
      input.reason,
    );
  }

  @RateLimit(20, 60, true)
  @Mutation(() => GraphQLJSON, { name: 'adminRestoreManagedEntity' })
  restore(
    @Args('input') input: AdminManagedEntityMutationInput,
    @Context() context: AdminRequestContext,
  ) {
    if (!input.recordId)
      throw new BadRequestException('ADMIN_ENTITY_ID_REQUIRED');
    return this.entities.restore(
      context.req.user.sub,
      input.entity,
      input.recordId,
      input.reason,
    );
  }
}
