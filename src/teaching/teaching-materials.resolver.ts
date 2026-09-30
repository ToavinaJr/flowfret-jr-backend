import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { TeachingEnrollmentStatus, UploadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TeachingMaterialModel } from './teaching-material.types';

type TeachingMaterialContext = { req: { user: { sub: string } } };

@Resolver(() => TeachingMaterialModel)
export class TeachingMaterialsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [TeachingMaterialModel])
  async teachingCourseMaterials(
    @Args('courseId') courseId: string,
    @Context() context: TeachingMaterialContext,
  ) {
    await this.assertCourseAccess(courseId, context.req.user.sub);
    const rows = await this.prisma.teachingMaterial.findMany({
      where: {
        courseId,
        isDeleted: false,
        upload: { isDeleted: false, status: UploadStatus.AVAILABLE },
      },
      include: { upload: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(({ upload, ...material }) => ({
      ...material,
      fileName: upload.fileName,
      fileType: upload.fileType,
      fileSize: upload.fileSize.toString(),
    }));
  }

  @Query(() => [TeachingMaterialModel])
  async teachingMaterialsForCourses(
    @Args('courseIds', { type: () => [String] }) courseIds: string[],
    @Context() context: TeachingMaterialContext,
  ) {
    if (!courseIds.length || courseIds.length > 100) return [];
    const uniqueIds = [...new Set(courseIds)];
    const accessible = await this.prisma.teachingCourse.findMany({
      where: {
        id: { in: uniqueIds },
        isDeleted: false,
        OR: [
          { instructor: { userId: context.req.user.sub } },
          {
            enrollments: {
              some: {
                studentId: context.req.user.sub,
                status: TeachingEnrollmentStatus.ACTIVE,
                isDeleted: false,
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (accessible.length !== uniqueIds.length)
      throw new ForbiddenException(
        'Un ou plusieurs cours ne sont pas accessibles.',
      );
    const rows = await this.prisma.teachingMaterial.findMany({
      where: {
        courseId: { in: uniqueIds },
        isDeleted: false,
        upload: { isDeleted: false, status: UploadStatus.AVAILABLE },
      },
      include: { upload: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map(({ upload, ...material }) => ({
      ...material,
      fileName: upload.fileName,
      fileType: upload.fileType,
      fileSize: upload.fileSize.toString(),
    }));
  }

  @Query(() => [TeachingMaterialModel])
  async teachingLessonMaterials(
    @Args('lessonId') lessonId: string,
    @Context() context: TeachingMaterialContext,
  ) {
    const lesson = await this.prisma.teachingLesson.findFirst({
      where: { id: lessonId, course: { isDeleted: false } },
      select: { courseId: true },
    });
    if (!lesson) throw new NotFoundException('Séance introuvable.');
    await this.assertCourseAccess(lesson.courseId, context.req.user.sub);
    const rows = await this.prisma.teachingMaterial.findMany({
      where: {
        courseId: lesson.courseId,
        isDeleted: false,
        OR: [{ lessonId: null }, { lessonId }],
        upload: { isDeleted: false, status: UploadStatus.AVAILABLE },
      },
      include: { upload: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(({ upload, ...material }) => ({
      ...material,
      fileName: upload.fileName,
      fileType: upload.fileType,
      fileSize: upload.fileSize.toString(),
    }));
  }

  @Mutation(() => Boolean)
  async deleteTeachingMaterial(
    @Args('id') id: string,
    @Context() context: TeachingMaterialContext,
  ) {
    const material = await this.prisma.teachingMaterial.findFirst({
      where: { id, isDeleted: false },
      include: { course: { include: { instructor: true } }, upload: true },
    });
    if (!material) throw new NotFoundException('Document introuvable.');
    if (material.course.instructor.userId !== context.req.user.sub)
      throw new ForbiddenException(
        'Seul l’enseignant propriétaire du cours peut supprimer ce document.',
      );
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.teachingMaterial.update({
        where: { id },
        data: { isDeleted: true, deletedAt: now },
      });
      await tx.upload.update({
        where: { id: material.uploadId },
        data: {
          isDeleted: true,
          deletedAt: now,
          status: UploadStatus.DELETED,
          cleanupPending: true,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'TEACHING_MATERIAL_DELETED',
          entityType: 'TEACHING_MATERIAL',
          entityId: id,
          metadata: {
            courseId: material.courseId,
            uploadId: material.uploadId,
          },
        },
      });
    });
    return true;
  }

  private async assertCourseAccess(courseId: string, userId: string) {
    const course = await this.prisma.teachingCourse.findFirst({
      where: { id: courseId, isDeleted: false },
      select: {
        instructor: { select: { userId: true } },
        enrollments: {
          where: {
            studentId: userId,
            status: TeachingEnrollmentStatus.ACTIVE,
            isDeleted: false,
          },
          select: { id: true },
        },
      },
    });
    if (!course) throw new NotFoundException('Cours introuvable.');
    if (course.instructor.userId !== userId && !course.enrollments.length)
      throw new ForbiddenException(
        'Vous devez être inscrit activement à ce cours.',
      );
  }
}
