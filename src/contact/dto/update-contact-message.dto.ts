import { ContactMessageStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateContactMessageDto {
  @IsEnum(ContactMessageStatus)
  status!: ContactMessageStatus;
}
