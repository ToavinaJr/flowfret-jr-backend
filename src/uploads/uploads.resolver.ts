import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Query,
  Resolver,
  Context,
} from '@nestjs/graphql';
import {
  CreateUploadInput,
  PostAttachmentModel,
  UpdateUploadInput,
  UploadModel,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { UploadCleanupService } from './upload-cleanup.service';

@Roles(UserRole.ADMIN)
@Resolver(() => UploadModel)
export class UploadsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cleanup: UploadCleanupService,
  ) {}

  @Query(() => [UploadModel], { name: 'uploads' })
  async uploads(): Promise<UploadModel[]> {
    const uploads = await this.prisma.upload.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return uploads.map((upload) => ({
      ...upload,
      fileSize: upload.fileSize.toString(),
    }));
  }

  @Query(() => UploadModel, { name: 'upload', nullable: true })
  async upload(@Args('id') id: string): Promise<UploadModel | null> {
    const upload = await this.prisma.upload.findUnique({ where: { id } });
    if (!upload) {
      return null;
    }

    return {
      ...upload,
      fileSize: upload.fileSize.toString(),
    };
  }

  @Mutation(() => UploadModel)
  async createUpload(
    @Args('data') data: CreateUploadInput,
  ): Promise<UploadModel> {
    const createdUpload = await this.prisma.upload.create({
      data: {
        ...data,
        fileSize: BigInt(data.fileSize),
      },
    });

    return {
      ...createdUpload,
      fileSize: createdUpload.fileSize.toString(),
    };
  }

  @Mutation(() => UploadModel)
  async updateUpload(
    @Args('id') id: string,
    @Args('data') data: UpdateUploadInput,
  ): Promise<UploadModel> {
    const { fileSize, ...rest } = data;
    const updatedUpload = await this.prisma.upload.update({
      where: { id },
      data: {
        ...rest,
        ...(fileSize !== undefined ? { fileSize: BigInt(fileSize) } : {}),
      },
    });

    return {
      ...updatedUpload,
      fileSize: updatedUpload.fileSize.toString(),
    };
  }

  @Mutation(() => UploadModel)
  async deleteUpload(
    @Args('id') id: string,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<UploadModel> {
    const deletedUpload = await this.prisma.$transaction(async (tx) => {
      const upload = await tx.upload.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          status: 'DELETED',
          cleanupPending: true,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: context.req.user.sub,
          action: 'UPLOAD_DELETED',
          entityType: 'upload',
          entityId: id,
          metadata: {},
        },
      });
      return upload;
    });
    await this.cleanup.processPending([id]);
    return {
      ...deletedUpload,
      fileSize: deletedUpload.fileSize.toString(),
    };
  }

  @ResolveField(() => UserModel, { name: 'user' })
  async user(@Parent() upload: UploadModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: upload.userId } });
  }

  @ResolveField(() => [PostAttachmentModel], { name: 'attachments' })
  async attachments(
    @Parent() upload: UploadModel,
  ): Promise<PostAttachmentModel[]> {
    return this.prisma.postAttachment.findMany({
      where: { uploadId: upload.id },
      orderBy: { createdAt: 'desc' },
    });
  }
}
