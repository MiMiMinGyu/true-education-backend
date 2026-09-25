import { ApiProperty } from '@nestjs/swagger';
import type { UserRole } from '../../../users/interfaces/user.interface';

export class LoginResponseDto {
  @ApiProperty({
    example: 'STUDENT',
    enum: ['STUDENT', 'PARENT'],
    description:
      '프론트는 이 값으로 로그인 직후 화면을 분기합니다(보호자 → 대시보드, 학생 → 메인 공간).',
  })
  role: UserRole;
}
