import { Module } from '@nestjs/common';
import { TeachingResolver } from './teaching.resolver';
import { TeachingLessonsResolver } from './teaching-lessons.resolver';
import { TeachingMaterialsResolver } from './teaching-materials.resolver';

@Module({
  providers: [
    TeachingResolver,
    TeachingLessonsResolver,
    TeachingMaterialsResolver,
  ],
})
export class TeachingModule {}
