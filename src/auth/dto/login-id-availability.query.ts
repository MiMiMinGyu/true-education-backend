import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { LOGIN_ID_PATTERN } from '../../common/constants/auth.constants';

export class LoginIdAvailabilityQuery {
  @ApiProperty({ example: 'yeoul01', description: '영문·숫자·_ 4~20자' })
  @Matches(LOGIN_ID_PATTERN, {
    message: '아이디는 영문, 숫자, _ 조합 4~20자로 입력해 주세요.',
  })
  loginId: string;
}
