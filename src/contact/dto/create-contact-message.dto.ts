import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateContactMessageDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name!: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 160)
  subject!: string;

  @Transform(trim)
  @IsString()
  @Length(10, 5000)
  message!: string;
}
