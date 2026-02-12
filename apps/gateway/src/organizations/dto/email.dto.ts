import { ApiProperty } from '@nestjs/swagger';

export class EmailDto {
  @ApiProperty({ description: 'Email address of the user.' })
  email: string;
}
