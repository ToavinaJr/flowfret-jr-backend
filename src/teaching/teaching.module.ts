import { Module } from '@nestjs/common';
import { TeachingResolver } from './teaching.resolver';
import { TeachingLessonsResolver } from './teaching-lessons.resolver';
import { TeachingMaterialsResolver } from './teaching-materials.resolver';
import { TeachingLessonRemindersService } from './teaching-lesson-reminders.service';
import { TeachingProfilesResolver } from './teaching-profiles.resolver';
import { TeachingAccessPolicy } from './teaching-access.policy';
import { TeachingEnrollmentsResolver } from './teaching-enrollments.resolver';
import { TeachingEnrollmentSupport } from './teaching-enrollment-support';

@Module({
  providers: [
    TeachingResolver,
    TeachingEnrollmentsResolver,
    TeachingProfilesResolver,
    TeachingAccessPolicy,
    TeachingEnrollmentSupport,
    TeachingLessonsResolver,
    TeachingMaterialsResolver,
    TeachingLessonRemindersService,
  ],
})
export class TeachingModule {}
