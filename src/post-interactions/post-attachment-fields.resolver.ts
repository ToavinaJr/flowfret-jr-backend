import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import {
  PostAttachmentModel,
  PostModel,
  UploadModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => PostAttachmentModel)
export class PostAttachmentsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @ResolveField(() => PostModel, { name: 'post' })
  post(@Parent() row: PostAttachmentModel): Promise<PostModel | null> {
    return this.prisma.post.findUnique({ where: { id: row.postId } });
  }

  @ResolveField(() => UploadModel, { name: 'upload' })
  async upload(
    @Parent() row: PostAttachmentModel,
  ): Promise<UploadModel | null> {
    if (Object.prototype.hasOwnProperty.call(row, 'upload')) {
      const upload = row.upload;
      return upload ? { ...upload, fileSize: String(upload.fileSize) } : null;
    }
    const upload = await this.prisma.upload.findUnique({
      where: { id: row.uploadId },
    });
    return upload ? { ...upload, fileSize: upload.fileSize.toString() } : null;
  }
}
