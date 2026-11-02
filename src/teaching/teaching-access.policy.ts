import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeachingAccessPolicy {
  constructor(private readonly prisma: PrismaService) {}

  async assertActiveUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: UserStatus.ACTIVE, isDeleted: false },
      select: { id: true, username: true },
    });
    if (!user)
      throw new ForbiddenException('Un compte FlowFret actif est requis.');
    return user;
  }
}
