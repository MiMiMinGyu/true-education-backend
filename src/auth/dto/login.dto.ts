import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'student01' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ example: 'pass1234' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
