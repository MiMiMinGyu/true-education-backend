import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';
import { SignupBaseDto } from './signup-base.dto';

export class SignupParentDto extends SignupBaseDto {
  @ApiProperty({
    example: 'aB3$vK',
    description: '학생 가입 시 발급된 6자리 코드(대소문자 구분)',
  })
  @IsString()
  @IsNotEmpty({ message: '학생 연결 코드를 입력해 주세요.' })
  studentCode: string;

  @ApiProperty({
    example: true,
    description: '이용약관·개인정보 처리방침 동의(필수)',
  })
  @IsBoolean()
  termsAgreed: boolean;

  @ApiProperty({ example: false, description: '마케팅 정보 수신 동의(선택)' })
  @IsBoolean()
  marketingAgreed: boolean;

  @ApiProperty({
    example: true,
    description: '자녀 개인정보 수집·이용 동의(법정대리인, 필수)',
  })
  @IsBoolean()
  guardianConsentAgreed: boolean;
}
