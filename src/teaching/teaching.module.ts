import { Module } from '@nestjs/common';
import { TeachingResolver } from './teaching.resolver';
import { TeachingLessonsResolver } from './teaching-lessons.resolver';
import { TeachingMaterialsResolver } from './teaching-materials.resolver';
import { TeachingLessonRemindersService } from './teaching-lesson-reminders.service';

@Module({
  providers: [
    TeachingResolver,
    TeachingLessonsResolver,
    TeachingMaterialsResolver,
    TeachingLessonRemindersService,
  ],
})
export class TeachingModule {}
