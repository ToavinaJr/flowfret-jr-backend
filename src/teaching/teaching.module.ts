import { Module } from '@nestjs/common';
import { TeachingResolver } from './teaching.resolver';

@Module({ providers: [TeachingResolver] })
export class TeachingModule {}
