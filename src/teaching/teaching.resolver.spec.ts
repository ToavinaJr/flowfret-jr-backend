import { TeachingResolver } from './teaching.resolver';

describe('TeachingResolver workspace queries', () => {
  it('returns enrollment requests for every course owned by the instructor', async () => {
    const prisma = {
      teachingEnrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'enrollment-1',
            courseId: 'course-1',
            studentId: 'student-1',
            status: 'REQUESTED',
            student: { username: 'learner' },
            course: { title: 'Beginner guitar' },
          },
        ]),
      },
    };
    const resolver = new TeachingResolver(prisma as never, {} as never);

    await expect(
      resolver.myTeachingCourseEnrollments({
        req: { user: { sub: 'teacher-1' } },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'enrollment-1',
        studentUsername: 'learner',
        courseTitle: 'Beginner guitar',
      }),
    ]);
    expect(prisma.teachingEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          status: {
            in: ['REQUESTED', 'INVITED', 'ACTIVE', 'PAUSED'],
          },
          course: {
            isDeleted: false,
            instructor: { userId: 'teacher-1' },
          },
        },
      }),
    );
  });

  it('exposes reserved seats without leaking the Prisma count shape', async () => {
    const prisma = {
      teachingCourse: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'course-1',
            title: 'Group guitar',
            _count: { enrollments: 3 },
          },
        ]),
      },
    };
    const resolver = new TeachingResolver(prisma as never, {} as never);

    await expect(resolver.publishedTeachingCourses()).resolves.toEqual([
      { id: 'course-1', title: 'Group guitar', reservedSeats: 3 },
    ]);
  });

  it('notifies the instructor when a student declines an invitation', async () => {
    const tx = {
      teachingEnrollment: {
        update: jest.fn().mockResolvedValue({
          id: 'enrollment-1',
          status: 'CANCELLED',
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      teachingEnrollment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'enrollment-1',
          courseId: 'course-1',
          studentId: 'student-1',
          status: 'INVITED',
          course: {
            maxStudents: 4,
            format: 'GROUP',
            instructor: { userId: 'teacher-1' },
          },
        }),
      },
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      notification: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const resolver = new TeachingResolver(prisma as never, {} as never);

    await resolver.respondToTeachingCourseInvitation('enrollment-1', false, {
      req: { user: { sub: 'student-1' } },
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'teacher-1',
        type: 'TEACHING_ENROLLMENT_UPDATED',
        payload: {
          courseId: 'course-1',
          enrollmentId: 'enrollment-1',
          studentId: 'student-1',
          status: 'CANCELLED',
        },
      },
    });
  });
});
