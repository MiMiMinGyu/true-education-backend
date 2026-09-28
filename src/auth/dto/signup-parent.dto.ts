import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { consentKeys } from '../../common/constants/consent.constants';
import { SignupBaseDto } from './signup-base.dto';

const PARENT_CONSENTS = consentKeys('PARENT');

export class SignupParentDto extends SignupBaseDto {
  @ApiPropertyOptional({
    example: 'aB3$vK',
    description:
      '(전환용, 선택) 학생 코드. 보내면 가입과 함께 연결 요청을 보냅니다(학생이 수락해야 연결). ' +
      '자녀는 가입 후 POST /parents/me/link-requests로 추가하는 것이 기본이며, 가입 화면에서 코드 칸이 빠지면 이 필드는 없앨 예정입니다.',
  })
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiProperty({
    example: ['terms', 'guardianPrivacy'],
    enum: PARENT_CONSENTS,
    isArray: true,
    description:
      '동의한 항목 id. 가입에는 terms·guardianPrivacy가 필수(marketing 선택). ' +
      '자녀 관련 항목(childPrivacy·childSpeech·guardianDashboard)은 studentCode를 보낼 때만 필수이고 그 학생 대상으로 기록합니다(없으면 무시).',
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(PARENT_CONSENTS, { each: true })
  agreements: string[];
}
