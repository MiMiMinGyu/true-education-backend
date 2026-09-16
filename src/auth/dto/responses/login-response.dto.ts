import { ApiProperty } from '@nestjs/swagger';
import type { UserRole } from '../../../users/interfaces/user.interface';

export class LoginResponseDto {
  @ApiProperty({
    example: 'student',
    enum: ['student', 'parent'],
    description: '프론트엔드는 이 값으로 로그인 성공 직후 화면을 자동 분기합니다.',
  })
  role: UserRole;
}
