import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { consentKeys } from '../../common/constants/consent.constants';
import { SignupBaseDto } from './signup-base.dto';

const PARENT_CONSENTS = consentKeys('PARENT');

export class SignupParentDto extends SignupBaseDto {
  @ApiProperty({
    example: 'aB3$vK',
    description: '학생 가입 시 발급된 6자리 코드(대소문자 구분)',
  })
  @IsString()
  @IsNotEmpty({ message: '학생 연결 코드를 입력해 주세요.' })
  studentCode: string;

  @ApiProperty({
    example: PARENT_CONSENTS.filter((key) => key !== 'marketing'),
    enum: PARENT_CONSENTS,
    isArray: true,
    description:
      '동의한 항목 id(가입 화면 체크 항목). marketing만 선택이고 나머지 다섯 항목은 필수, 하나라도 빠지면 400',
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(PARENT_CONSENTS, { each: true })
  agreements: string[];
}
