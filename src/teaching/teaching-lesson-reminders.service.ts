import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  NotificationType,
  TeachingEnrollmentStatus,
  TeachingLessonStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CHECK_INTERVAL_MS = 60_000;
const REMINDER_WINDOWS = [
  { minutesBefore: 24 * 60, graceMinutes: 120 },
  { minutesBefore: 60, graceMinutes: 30 },
] as const;

@Injectable()
export class TeachingLessonRemindersService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TeachingLessonRemindersService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.deliverDueReminders();
    this.timer = setInterval(
      () => void this.deliverDueReminders(),
      CHECK_INTERVAL_MS,
    );
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async deliverDueReminders() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const due = [] as Array<{
        lessonId: string;
        courseId: string;
        courseTitle: string;
        startsAt: Date;
        timeZone: string;
        recipientIds: string[];
        minutesBefore: number;
      }>;

      for (const window of REMINDER_WINDOWS) {
        const reminderAt = new Date(
          now.getTime() - window.graceMinutes * 60_000,
        );
        const startsAtLowerBound = new Date(
          reminderAt.getTime() + window.minutesBefore * 60_000,
        );
        const startsAtUpperBound = new Date(
          now.getTime() + window.minutesBefore * 60_000,
        );
        const lessons = await this.prisma.teachingLesson.findMany({
          where: {
            status: TeachingLessonStatus.SCHEDULED,
            startsAt: { gte: startsAtLowerBound, lte: startsAtUpperBound },
            course: { isDeleted: false },
          },
          select: {
            id: true,
            courseId: true,
            startsAt: true,
            timeZone: true,
            course: {
              select: {
                title: true,
                instructor: { select: { userId: true } },
              },
            },
            attendances: {
              where: {
                enrollment: {
                  status: TeachingEnrollmentStatus.ACTIVE,
                  isDeleted: false,
                },
              },
              select: { enrollment: { select: { studentId: true } } },
            },
          },
        });

        for (const lesson of lessons) {
          const recipientIds = [
            lesson.course.instructor.userId,
            ...lesson.attendances.map(({ enrollment }) => enrollment.studentId),
          ];
          due.push({
            lessonId: lesson.id,
            courseId: lesson.courseId,
            courseTitle: lesson.course.title,
            startsAt: lesson.startsAt,
            timeZone: lesson.timeZone,
            recipientIds: [...new Set(recipientIds)],
            minutesBefore: window.minutesBefore,
          });
        }
      }

      const uniqueRecipientIds = [
        ...new Set(due.flatMap(({ recipientIds }) => recipientIds)),
      ];
      if (!due.length || !uniqueRecipientIds.length) return;

      const disabledPreferences =
        await this.prisma.notificationPreference.findMany({
          where: {
            userId: { in: uniqueRecipientIds },
            type: NotificationType.TEACHING_LESSON_REMINDER,
            enabled: false,
          },
          select: { userId: true },
        });
      const disabledIds = new Set(
        disabledPreferences.map(({ userId }) => userId),
      );

      const reminders = due.flatMap((reminder) =>
        reminder.recipientIds.map((userId) => ({
          lessonId: reminder.lessonId,
          userId,
          minutesBefore: reminder.minutesBefore,
          startsAt: reminder.startsAt,
        })),
      );
      const notifications = due.flatMap((reminder) =>
        reminder.recipientIds
          .filter((userId) => !disabledIds.has(userId))
          .map((userId) => ({
            userId,
            type: NotificationType.TEACHING_LESSON_REMINDER,
            dedupeKey: `${reminder.lessonId}:${userId}:${reminder.minutesBefore}:${reminder.startsAt.getTime()}`,
            payload: {
              lessonId: reminder.lessonId,
              courseId: reminder.courseId,
              courseTitle: reminder.courseTitle,
              startsAt: reminder.startsAt.toISOString(),
              timeZone: reminder.timeZone,
              minutesBefore: reminder.minutesBefore,
            },
          })),
      );

      await this.prisma.$transaction(async (tx) => {
        await tx.teachingLessonReminder.createMany({
          data: reminders,
          skipDuplicates: true,
        });
        await tx.notification.createMany({
          data: notifications,
          skipDuplicates: true,
        });
      });
      if (notifications.length)
        this.logger.log(
          `Processed ${notifications.length} due lesson reminders.`,
        );
    } catch (error) {
      this.logger.error(
        `Lesson reminder delivery failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.running = false;
    }
  }
}
