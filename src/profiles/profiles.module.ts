import { Module } from '@nestjs/common';
import { ProfilesResolver } from './profiles.resolver';
import { ProfileFieldsResolver } from './profile-fields.resolver';

@Module({ providers: [ProfilesResolver, ProfileFieldsResolver] })
export class ProfilesModule {}
