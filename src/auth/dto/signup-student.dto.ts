import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  STUDENT_AGE_MAX,
  STUDENT_AGE_MIN,
} from '../../common/constants/auth.constants';
import { consentKeys } from '../../common/constants/consent.constants';
import { SignupBaseDto } from './signup-base.dto';

const STUDENT_CONSENTS = consentKeys('STUDENT');

export class SignupStudentDto extends SignupBaseDto {
  @ApiPropertyOptional({
    example: 8,
    minimum: STUDENT_AGE_MIN,
    maximum: STUDENT_AGE_MAX,
    description:
      '가입 시 입력한 나이. 서버가 출생 연도(현재 연도 − 나이, Asia/Seoul)로 저장',
  })
  @IsOptional()
  @IsInt()
  @Min(STUDENT_AGE_MIN)
  @Max(STUDENT_AGE_MAX)
  age?: number;

  @ApiProperty({
    example: STUDENT_CONSENTS,
    enum: STUDENT_CONSENTS,
    isArray: true,
    description:
      '동의한 항목 id(가입 화면 체크 항목). 세 항목 모두 필수이며 하나라도 빠지면 400',
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(STUDENT_CONSENTS, { each: true })
  agreements: string[];
}
