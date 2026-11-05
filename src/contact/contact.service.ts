import { Injectable } from '@nestjs/common';
import { ContactMessageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListContactMessagesDto } from './dto/list-contact-messages.dto';

@Injectable()
export class ContactService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): Promise<void> {
    await this.prisma.contactMessage.create({
      data: {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        subject: input.subject.trim(),
        message: input.message.trim(),
      },
      select: { id: true },
    });
  }

  async list(input: ListContactMessagesDto) {
    const where: Prisma.ContactMessageWhereInput = input.status
      ? { status: input.status }
      : {};
    const [nodes, totalCount] = await this.prisma.$transaction([
      this.prisma.contactMessage.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.take,
        skip: input.skip,
      }),
      this.prisma.contactMessage.count({ where }),
    ]);
    return { nodes, totalCount };
  }

  updateStatus(id: string, status: ContactMessageStatus) {
    return this.prisma.contactMessage.update({
      where: { id },
      data: { status },
    });
  }
}
