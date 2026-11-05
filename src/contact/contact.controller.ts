import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Public } from '../auth/public.decorator';
import { RateLimit } from '../auth/rate-limit.decorator';
import { Roles } from '../auth/roles.decorator';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';
import { ListContactMessagesDto } from './dto/list-contact-messages.dto';
import { UpdateContactMessageDto } from './dto/update-contact-message.dto';

@Controller('api/contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post('messages')
  @Public()
  @RateLimit(5, 3600, true)
  async submit(@Body() dto: CreateContactMessageDto) {
    await this.contact.create(dto);
    return { accepted: true };
  }

  @Get('messages')
  @Roles(UserRole.ADMIN)
  list(@Query() query: ListContactMessagesDto) {
    return this.contact.list(query);
  }

  @Patch('messages/:id/status')
  @Roles(UserRole.ADMIN)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactMessageDto,
  ) {
    return this.contact.updateStatus(id, dto.status);
  }
}
