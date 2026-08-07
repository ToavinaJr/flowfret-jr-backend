import { IsUrl } from 'class-validator';
export class RetryTranscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  audioUrl: string;
}
