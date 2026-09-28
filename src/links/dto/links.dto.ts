import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { CHILD_CONSENT_KEYS } from '../../common/constants/consent.constants';

export class CreateLinkRequestDto {
  @ApiProperty({
    example: 'aB3$vK',
    description: '아이의 6자리 학생 코드(대소문자 구분, 앞뒤 공백은 무시)',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: '학생 코드를 입력해 주세요.' })
  studentCode: string;

  @ApiProperty({
    example: CHILD_CONSENT_KEYS,
    enum: CHILD_CONSENT_KEYS,
    isArray: true,
    description:
      '이 아이에 대한 동의 항목 id(모두 필수, 하나라도 빠지면 400). 요청할 때마다 그 아이 대상으로 기록합니다.',
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(CHILD_CONSENT_KEYS, { each: true })
  agreements: string[];
}

export class ParentLinkRequestDto {
  @ApiProperty({ example: 3 }) studentId: number;
  @ApiProperty({
    example: '김*울',
    description: '아이가 수락하기 전이라 이름 가운데를 가립니다',
  })
  studentName: string;
  @ApiProperty({
    example: 'aB3$vK',
    description: '요청할 때 입력한 학생 코드(보호자 화면의 대기 목록 표시용)',
  })
  studentCode: string;
  @ApiProperty({
    enum: ['PENDING', 'REJECTED'],
    description:
      'PENDING = 아이 수락 대기, REJECTED = 아이가 거절(정해진 시간이 지나면 다시 요청 가능)',
  })
  status: 'PENDING' | 'REJECTED';
  @ApiProperty() requestedAt: Date;
  @ApiProperty({ nullable: true, type: Date, example: null })
  respondedAt: Date | null;
  @ApiProperty({
    nullable: true,
    type: Date,
    example: null,
    description: '거절된 요청을 다시 보낼 수 있는 시각(대기 중이면 null)',
  })
  retryAfter: Date | null;
}

export class StudentLinkRequestDto {
  @ApiProperty({ example: 7 }) parentId: number;
  @ApiProperty({ example: '김보호', description: '보호자가 가입할 때 쓴 이름' })
  parentName: string;
  @ApiProperty() requestedAt: Date;
}

export class LinkResponseDto {
  @ApiProperty({ example: 7 }) parentId: number;
  @ApiProperty({ enum: ['ACCEPTED', 'REJECTED'] })
  status: 'ACCEPTED' | 'REJECTED';
}
