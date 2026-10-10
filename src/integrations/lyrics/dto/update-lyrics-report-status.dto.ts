import { ReportStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateLyricsReportStatusDto {
  @IsEnum(ReportStatus)
  status!: ReportStatus;
}
