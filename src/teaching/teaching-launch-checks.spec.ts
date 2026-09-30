import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TeachingMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TeachingLessonsResolver,
  normalizeSchedule,
  validateWindow,
} from './teaching-lessons.resolver';
import { TeachingMaterialsResolver } from './teaching-materials.resolver';

describe('teaching launch checks', () => {
  afterEach(() => jest.useRealTimers());

  describe('lesson schedule validation', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-30T08:00:00.000Z'));
    });

    it('normalizes an online session and derives its end from the course duration', () => {
      const schedule = normalizeSchedule(
        {
          startsAt: new Date('2026-10-01T10:00:00.000Z'),
          timeZone: 'Africa/Nairobi',
          meetingUrl: 'https://meet.example.com/lesson',
        },
        TeachingMode.ONLINE,
        45,
      );

      expect(schedule).toMatchObject({
        startsAt: new Date('2026-10-01T10:00:00.000Z'),
        endsAt: new Date('2026-10-01T10:45:00.000Z'),
        timeZone: 'Africa/Nairobi',
        teachingMode: TeachingMode.ONLINE,
        location: null,
        meetingUrl: 'https://meet.example.com/lesson',
      });
    });

    it.each([
      [
        'a date in the past',
        { startsAt: new Date('2026-09-29T10:00:00Z') },
        TeachingMode.ONLINE,
      ],
      [
        'an invalid IANA timezone',
        { timeZone: 'Mars/Olympus' },
        TeachingMode.ONLINE,
      ],
      [
        'a missing hybrid lesson mode',
        { teachingMode: undefined },
        TeachingMode.HYBRID,
      ],
      [
        'an insecure meeting link',
        { meetingUrl: 'http://meet.example.com' },
        TeachingMode.ONLINE,
      ],
      [
        'a missing in-person location',
        { teachingMode: TeachingMode.IN_PERSON, location: undefined },
        TeachingMode.HYBRID,
      ],
    ])('rejects %s', (_case, overrides, courseMode) => {
      expect(() =>
        normalizeSchedule(
          {
            startsAt: new Date('2026-10-01T10:00:00.000Z'),
            timeZone: 'UTC',
            teachingMode: TeachingMode.ONLINE,
            meetingUrl: 'https://meet.example.com/lesson',
            location: 'Studio 1',
            ...overrides,
          },
          courseMode,
          45,
        ),
      ).toThrow(BadRequestException);
    });

    it('limits calendar queries to a positive window of at most 93 days', () => {
      const from = new Date('2026-09-01T00:00:00.000Z');
      expect(() =>
        validateWindow(
          from,
          new Date(from.getTime() + 93 * 24 * 60 * 60 * 1000),
        ),
      ).not.toThrow();
      expect(() => validateWindow(from, from)).toThrow(BadRequestException);
      expect(() =>
        validateWindow(
          from,
          new Date(from.getTime() + 94 * 24 * 60 * 60 * 1000),
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('reservation authorization', () => {
    it('does not schedule a lesson for a non-owner or unapproved instructor', async () => {
      const prisma = {
        teachingCourse: { findFirst: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn(),
      };
      const resolver = new TeachingLessonsResolver(
        prisma as unknown as PrismaService,
      );

      await expect(
        resolver.scheduleTeachingLesson(
          'course-id',
          {
            startsAt: new Date(Date.now() + 60 * 60 * 1000),
            timeZone: 'UTC',
            teachingMode: TeachingMode.ONLINE,
            meetingUrl: 'https://meet.example.com/lesson',
          },
          { req: { user: { sub: 'other-user' } } },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.teachingCourse.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('requires at least one active enrollment before scheduling', async () => {
      const prisma = {
        teachingCourse: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'course-id',
            instructorId: 'instructor-id',
            teachingMode: TeachingMode.ONLINE,
            durationMinutes: 45,
            enrollments: [],
          }),
        },
        $transaction: jest.fn(),
      };
      const resolver = new TeachingLessonsResolver(
        prisma as unknown as PrismaService,
      );

      await expect(
        resolver.scheduleTeachingLesson(
          'course-id',
          {
            startsAt: new Date(Date.now() + 60 * 60 * 1000),
            timeZone: 'UTC',
            meetingUrl: 'https://meet.example.com/lesson',
          },
          { req: { user: { sub: 'teacher-id' } } },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an invalid weekly series length before database access', async () => {
      const prisma = { teachingCourse: { findFirst: jest.fn() } };
      const resolver = new TeachingLessonsResolver(
        prisma as unknown as PrismaService,
      );

      await expect(
        resolver.scheduleTeachingLessonSeries(
          'course-id',
          {
            startsAt: new Date(Date.now() + 60 * 60 * 1000),
            timeZone: 'UTC',
            teachingMode: TeachingMode.ONLINE,
            meetingUrl: 'https://meet.example.com/lesson',
          },
          25,
          { req: { user: { sub: 'teacher-id' } } },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.teachingCourse.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('course material access', () => {
    it('denies access to a student without an active enrollment', async () => {
      const prisma = {
        teachingCourse: {
          findFirst: jest.fn().mockResolvedValue({
            instructor: { userId: 'teacher-id' },
            enrollments: [],
          }),
        },
        teachingMaterial: { findMany: jest.fn() },
      };
      const resolver = new TeachingMaterialsResolver(
        prisma as unknown as PrismaService,
      );

      await expect(
        resolver.teachingCourseMaterials('course-id', {
          req: { user: { sub: 'student-id' } },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.teachingCourse.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.teachingMaterial.findMany).not.toHaveBeenCalled();
    });

    it('allows the course instructor to read course materials', async () => {
      const prisma = {
        teachingCourse: {
          findFirst: jest.fn().mockResolvedValue({
            instructor: { userId: 'teacher-id' },
            enrollments: [],
          }),
        },
        teachingMaterial: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const resolver = new TeachingMaterialsResolver(
        prisma as unknown as PrismaService,
      );

      await expect(
        resolver.teachingCourseMaterials('course-id', {
          req: { user: { sub: 'teacher-id' } },
        }),
      ).resolves.toEqual([]);
      expect(prisma.teachingMaterial.findMany).toHaveBeenCalled();
    });
  });
});
