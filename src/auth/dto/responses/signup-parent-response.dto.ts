import { ApiProperty } from '@nestjs/swagger';

export class SignupParentResponseDto {
  @ApiProperty({ example: 1 })
  id: number;
}
