import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  LOGIN_ID_PATTERN,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../common/constants/auth.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SignupBaseDto {
  @ApiProperty({ example: '김여울', maxLength: NAME_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: '이름을 입력해 주세요.' })
  @MaxLength(NAME_MAX_LENGTH)
  name: string;

  @ApiProperty({ example: 'yeoul01', description: '영문·숫자·_ 4~20자' })
  @Matches(LOGIN_ID_PATTERN, {
    message: '아이디는 영문, 숫자, _ 조합 4~20자로 입력해 주세요.',
  })
  loginId: string;

  @ApiProperty({
    example: 'password123',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: '비밀번호는 8자 이상이어야 합니다.',
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
