import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../identity/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../identity/auth/guards/jwt-auth.guard';
import { UserPayload } from '../../platform/common/types/jwt-payload.type';
import { CronTriggersService } from './cron-triggers.service';
import { CreateCronTriggerDto, SetActiveCronTriggerDto, UpdateCronTriggerDto } from './dto';

@Controller('cron-triggers')
@UseGuards(JwtAuthGuard)
export class CronTriggersController {
  constructor(private readonly cronTriggersService: CronTriggersService) {}

  @Post()
  create(@CurrentUser() user: UserPayload, @Body() dto: CreateCronTriggerDto) {
    return this.cronTriggersService.create(user.organizationId, dto);
  }

  @Get()
  list(@CurrentUser() user: UserPayload) {
    return this.cronTriggersService.listByOrg(user.organizationId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: UserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.cronTriggersService.findOne(user.organizationId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCronTriggerDto,
  ) {
    return this.cronTriggersService.update(user.organizationId, id, dto);
  }

  @Patch(':id/active')
  setActive(
    @CurrentUser() user: UserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActiveCronTriggerDto,
  ) {
    return this.cronTriggersService.setActive(user.organizationId, id, dto.isActive);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: UserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.cronTriggersService.delete(user.organizationId, id);
  }
}
