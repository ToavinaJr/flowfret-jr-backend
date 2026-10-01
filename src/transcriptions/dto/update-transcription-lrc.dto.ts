import { IsString, MaxLength } from 'class-validator';

export class UpdateTranscriptionLrcDto {
  @IsString()
  @MaxLength(12_000)
  content: string;
}
