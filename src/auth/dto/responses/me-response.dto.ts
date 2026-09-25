import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UserRole } from '../../../users/interfaces/user.interface';

export class MeResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'STUDENT', enum: ['STUDENT', 'PARENT'] })
  role: UserRole;

  @ApiProperty({ example: '김여울' })
  name: string;

  @ApiPropertyOptional({
    example: 'T5y6*F',
    description: '학생만 포함. 마이페이지(설정)에서 보호자 연결 코드 재확인용',
  })
  studentCode?: string;
}
