import { ApiProperty } from '@nestjs/swagger';
import type { UserRole } from '../../../users/interfaces/user.interface';

export class MeResponseDto {
  @ApiProperty({ example: 'f6136499-9e00-44a7-956a-4539a95f905d' })
  id: string;

  @ApiProperty({ example: 'parent01' })
  username: string;

  @ApiProperty({ example: 'parent', enum: ['student', 'parent'] })
  role: UserRole;
}
