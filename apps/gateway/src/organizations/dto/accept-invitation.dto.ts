import { ApiProperty } from '@nestjs/swagger';
import { AcceptInvitationDto as IAcceptInvitationDto } from '@tesseract/types';

export class AcceptInvitationDto implements IAcceptInvitationDto {
  @ApiProperty({ description: 'Username of the invited user.' })
  user: string;

  @ApiProperty({ description: 'Password for the new user account.' })
  password: string;

  @ApiProperty({ description: 'Verification code sent to the user.' })
  verificationCode: string;
}
