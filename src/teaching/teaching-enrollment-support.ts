import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  TeachingCourseFormat,
  TeachingEnrollmentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const activeEnrollmentStatuses: TeachingEnrollmentStatus[] = [
  TeachingEnrollmentStatus.REQUESTED,
  TeachingEnrollmentStatus.INVITED,
  TeachingEnrollmentStatus.ACTIVE,
  TeachingEnrollmentStatus.PAUSED,
];

@Injectable()
export class TeachingEnrollmentSupport {
  constructor(private readonly prisma: PrismaService) {}
  async assertCapacity(
    courseId: string,
    maxStudents: number,
    format: TeachingCourseFormat,
  ) {
    if (format === TeachingCourseFormat.INDIVIDUAL) {
      const occupied = await this.prisma.teachingEnrollment.count({
        where: {
          courseId,
          isDeleted: false,
          status: { in: activeEnrollmentStatuses },
        },
      });
      if (occupied > 0)
        throw new BadRequestException(
          'Ce cours individuel a déjà une demande ou une place réservée.',
        );
    } else {
      const occupied = await this.prisma.teachingEnrollment.count({
        where: {
          courseId,
          isDeleted: false,
          status: { in: activeEnrollmentStatuses },
        },
      });
      if (occupied >= maxStudents)
        throw new BadRequestException('Ce cours a atteint sa capacité.');
    }
  }

  async assertCapacityInTransaction(
    tx: Prisma.TransactionClient,
    courseId: string,
    maxStudents: number,
    format: TeachingCourseFormat,
    excludeEnrollmentId?: string,
  ) {
    // Serialize capacity changes per course so concurrent requests cannot
    // reserve the same last seat.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${courseId}, 0))`;
    const occupied = await tx.teachingEnrollment.count({
      where: {
        courseId,
        isDeleted: false,
        status: { in: activeEnrollmentStatuses },
        ...(excludeEnrollmentId ? { id: { not: excludeEnrollmentId } } : {}),
      },
    });
    if (
      (format === TeachingCourseFormat.INDIVIDUAL && occupied > 0) ||
      (format === TeachingCourseFormat.GROUP && occupied >= maxStudents)
    ) {
      throw new BadRequestException(
        format === TeachingCourseFormat.INDIVIDUAL
          ? 'Ce cours individuel a déjà une demande ou une place réservée.'
          : 'Ce cours a atteint sa capacité.',
      );
    }
  }

  async createNotification(
    userId: string,
    type:
      | 'TEACHING_COURSE_INVITATION'
      | 'TEACHING_ENROLLMENT_REQUEST'
      | 'TEACHING_ENROLLMENT_UPDATED'
      | 'TEACHING_LESSON_CANCELLED',
    payload: Prisma.InputJsonObject,
  ) {
    const notificationType =
      type as Prisma.NotificationUncheckedCreateInput['type'];
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId_type: { userId, type: notificationType } },
      select: { enabled: true },
    });
    if (preference?.enabled === false) return;
    await this.prisma.notification.create({
      data: { userId, type: notificationType, payload },
    });
  }
}
