import { Query, Resolver } from '@nestjs/graphql';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './auth/public.decorator';

@Resolver()
export class AppResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Query(() => String, { name: 'dbHealth' })
  async dbHealth(): Promise<string> {
    await this.prisma.$queryRaw`SELECT 1`;
    return 'ok';
  }
}
