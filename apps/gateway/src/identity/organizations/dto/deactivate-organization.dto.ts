import { ApiProperty } from '@nestjs/swagger';

export class DeactivateOrganizationDto {
  @ApiProperty({ description: 'The user ID or name of the person deactivating the organization.' })
  deactivatedBy: string;

  @ApiProperty({ description: 'Reason for deactivating the organization. Optional.' })
  reason?: string;
}
