import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupStudentDto {
  @ApiProperty({ example: 'student01', minLength: 4, maxLength: 20 })
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: '아이디는 영문, 숫자, _ 만 사용할 수 있습니다.',
  })
  username: string;

  @ApiProperty({ example: 'pass1234', minLength: 8, maxLength: 64 })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;
}
