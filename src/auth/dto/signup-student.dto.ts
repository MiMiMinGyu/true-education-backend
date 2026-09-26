import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  STUDENT_AGE_MAX,
  STUDENT_AGE_MIN,
} from '../../common/constants/auth.constants';
import { SignupBaseDto } from './signup-base.dto';

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
    example: true,
    description:
      '학습 내용 보호자 전달 동의(필수, 사전 고지). true가 아니면 400',
  })
  @IsBoolean()
  guardianShareAgreed: boolean;
}
