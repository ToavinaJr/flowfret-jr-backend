import { Query, Resolver } from '@nestjs/graphql';
import { PrismaService } from './prisma/prisma.service';

@Resolver()
export class AppResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => String, { name: 'dbHealth' })
  async dbHealth(): Promise<string> {
    await this.prisma.$queryRaw`SELECT 1`;
    return 'ok';
  }
}
