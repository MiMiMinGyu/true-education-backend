import { ApiProperty } from '@nestjs/swagger';

export class LoginIdAvailabilityResponseDto {
  @ApiProperty({
    example: true,
    description: '학생·보호자 계정 어디에도 없으면 true',
  })
  available: boolean;
}
