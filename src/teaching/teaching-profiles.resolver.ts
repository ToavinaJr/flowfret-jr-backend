import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { InstructorStatus, UserRole } from '@prisma/client';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../common/domain.constants';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  InstructorProfileModel,
  UpsertInstructorProfileInput,
} from './teaching.types';
import { TeachingAccessPolicy } from './teaching-access.policy';
import { normalizeList, normalizeOptionalText } from './teaching.utils';

type TeachingContext = { req: { user: { sub: string } } };

@Resolver()
export class TeachingProfilesResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessPolicy: TeachingAccessPolicy,
  ) {}

  @Query(() => InstructorProfileModel, {
    name: 'myInstructorProfile',
    nullable: true,
  })
  async myInstructorProfile(@Context() context: TeachingContext) {
    const profile = await this.prisma.instructorProfile.findFirst({
      where: { userId: context.req.user.sub, isDeleted: false },
    });
    return profile
      ? { ...profile, storageQuotaBytes: profile.storageQuotaBytes.toString() }
      : null;
  }

  @Roles(UserRole.ADMIN)
  @Query(() => [InstructorProfileModel], { name: 'adminInstructorProfiles' })
  async adminInstructorProfiles(
    @Args('status', { type: () => InstructorStatus, nullable: true })
    status?: InstructorStatus,
  ) {
    const profiles = await this.prisma.instructorProfile.findMany({
      where: { isDeleted: false, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return profiles.map((profile) => ({
      ...profile,
      storageQuotaBytes: profile.storageQuotaBytes.toString(),
    }));
  }

  @Roles(UserRole.ADMIN)
  @Mutation(() => InstructorProfileModel)
  async setInstructorStorageQuota(
    @Args('id') id: string,
    @Args('storageQuotaBytes') value: string,
    @Context() context: TeachingContext,
  ) {
    if (!/^\d+$/.test(value)) throw new BadRequestException('Quota invalide.');
    const quota = BigInt(value);
    if (quota < 50n * 1024n * 1024n || quota > 1024n * 1024n * 1024n * 1024n)
      throw new BadRequestException(
        'Le quota doit être compris entre 50 Mio et 1 Tio.',
      );
    const profile = await this.prisma.instructorProfile.findFirst({
      where: { id, isDeleted: false },
    });
    if (!profile) throw new NotFoundException('Profil enseignant introuvable.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.instructorProfile.update({
        where: { id },
        data: { storageQuotaBytes: quota },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'TEACHER_STORAGE_QUOTA_UPDATED',
          entityType: 'instructor_profile',
          entityId: id,
          metadata: { storageQuotaBytes: value },
        },
      });
      return row;
    });
    return {
      ...updated,
      storageQuotaBytes: updated.storageQuotaBytes.toString(),
    };
  }

  @Roles(UserRole.ADMIN)
  @Mutation(() => InstructorProfileModel)
  async reviewInstructorProfile(
    @Args('id') id: string,
    @Args('status', { type: () => InstructorStatus }) status: InstructorStatus,
    @Context() context: TeachingContext,
  ) {
    const reviewableStatuses: InstructorStatus[] = [
      InstructorStatus.APPROVED,
      InstructorStatus.REJECTED,
      InstructorStatus.SUSPENDED,
    ];
    if (!reviewableStatuses.includes(status))
      throw new BadRequestException('Statut de validation invalide.');
    const profile = await this.prisma.instructorProfile.findFirst({
      where: { id, isDeleted: false },
    });
    if (!profile) throw new NotFoundException('Profil enseignant introuvable.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.instructorProfile.update({
        where: { id },
        data: { status },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: AUDIT_ACTION.TEACHER_PROFILE_UPSERTED,
          entityType: AUDIT_ENTITY.INSTRUCTOR_PROFILE,
          entityId: id,
          metadata: { status, reviewed: true },
        },
      });
      return row;
    });
    return {
      ...updated,
      storageQuotaBytes: updated.storageQuotaBytes.toString(),
    };
  }

  @Mutation(() => InstructorProfileModel)
  async upsertInstructorProfile(
    @Args('data') data: UpsertInstructorProfileInput,
    @Context() context: TeachingContext,
  ) {
    const userId = context.req.user.sub;
    await this.accessPolicy.assertActiveUser(userId);
    const clean = {
      headline: normalizeOptionalText(data.headline),
      biography: normalizeOptionalText(data.biography),
      experienceYears: data.experienceYears,
      specialties: normalizeList(data.specialties),
      languages: normalizeList(data.languages),
    };
    const profile = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.instructorProfile.findUnique({
        where: { userId },
      });
      const result = existing
        ? await tx.instructorProfile.update({
            where: { id: existing.id },
            data: { ...clean, isDeleted: false, deletedAt: null },
          })
        : await tx.instructorProfile.create({ data: { userId, ...clean } });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: AUDIT_ACTION.TEACHER_PROFILE_UPSERTED,
          entityType: AUDIT_ENTITY.INSTRUCTOR_PROFILE,
          entityId: result.id,
          metadata: { status: result.status },
        },
      });
      return result;
    });
    return {
      ...profile,
      storageQuotaBytes: profile.storageQuotaBytes.toString(),
    };
  }
}
