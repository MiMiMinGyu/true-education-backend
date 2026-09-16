import { ApiProperty } from '@nestjs/swagger';

export class SignupStudentResponseDto {
  @ApiProperty({ example: '62fc1fc3-e86f-4f25-8114-b6424299fb62' })
  id: string;

  @ApiProperty({ example: 'student01' })
  username: string;

  @ApiProperty({
    example: 'T5y64*Ffnt',
    description: '부모 계정이 연동 시 입력할 학생 코드. 재조회는 불가하므로 가입 응답 시 1회 노출.',
  })
  studentCode: string;
}
