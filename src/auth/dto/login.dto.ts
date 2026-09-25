import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import type { UserRole } from '../../users/interfaces/user.interface';

export class LoginDto {
  @ApiProperty({
    enum: ['STUDENT', 'PARENT'],
    example: 'STUDENT',
    description: '로그인 화면에서 선택한 탭. 해당 역할의 계정만 조회합니다.',
  })
  @IsIn(['STUDENT', 'PARENT'])
  role: UserRole;

  @ApiProperty({ example: 'yeoul01' })
  @IsString()
  @IsNotEmpty()
  loginId: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
