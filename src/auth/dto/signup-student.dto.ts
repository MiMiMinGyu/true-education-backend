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

  @ApiPropertyOptional({
    example: true,
    description:
      '학습 내용 보호자 전달 동의. 원래 필수(false면 400)지만 프론트 체크박스 추가 전까지 임시로 선택(없으면 false로 기록)',
  })
  @IsOptional()
  @IsBoolean()
  guardianShareAgreed?: boolean;
}
