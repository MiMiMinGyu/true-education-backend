import { ApiProperty } from '@nestjs/swagger';

export class SignupStudentResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({
    example: 'T5y6*F',
    description:
      '보호자가 가입할 때 입력할 학생 코드. 가입 완료 화면에 표시하며 GET /me로 다시 볼 수 있음',
  })
  studentCode: string;
}
