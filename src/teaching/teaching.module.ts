import { Module } from '@nestjs/common';
import { TeachingResolver } from './teaching.resolver';
import { TeachingLessonsResolver } from './teaching-lessons.resolver';

@Module({ providers: [TeachingResolver, TeachingLessonsResolver] })
export class TeachingModule {}
