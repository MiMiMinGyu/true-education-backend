import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupParentDto {
  @ApiProperty({ example: 'parent01', minLength: 4, maxLength: 20 })
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

  // 학생 가입 시 발급된 학생 코드. 서버가 DB에 저장된 코드와 대조해 부모-학생 관계를 매핑합니다.
  @ApiProperty({
    example: 'aB3$vK',
    description: '학생 가입 시 발급된 학생 코드',
  })
  @IsString()
  @IsNotEmpty()
  studentCode: string;
}
