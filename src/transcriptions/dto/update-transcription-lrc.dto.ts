import { IsString, MaxLength } from 'class-validator';

export class UpdateTranscriptionLrcDto {
  @IsString()
  @MaxLength(200_000)
  content: string;
}
