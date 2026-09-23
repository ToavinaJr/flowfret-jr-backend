import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreatePostInput,
  PostModel,
  UpdatePostInput,
} from '../graphql/graphql.types';
import { syncPostMentions } from '../common/mentions';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadCleanupService } from '../uploads/upload-cleanup.service';

export interface PostActor {
  sub: string;
  username?: string;
}

@Injectable()
export class PostsCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly uploadCleanup: UploadCleanupService,
  ) {}

  async create(data: CreatePostInput, actor: PostActor): Promise<PostModel> {
    if (data.authorId !== actor.sub)
      throw new ForbiddenException('Vous ne pouvez publier qu’en votre nom.');
    const content = data.content?.trim() || null;
    const imageUploadIds = data.imageUploadIds ?? [];
    if (!content && imageUploadIds.length === 0)
      throw new BadRequestException('Ajoutez un texte ou au moins une image.');
    const uploads = imageUploadIds.length
      ? await this.prisma.upload.findMany({
          where: {
            id: { in: imageUploadIds },
            userId: actor.sub,
            isDeleted: false,
            fileType: { startsWith: 'image/' },
          },
        })
      : [];
    if (uploads.length !== imageUploadIds.length)
      throw new BadRequestException('Une ou plusieurs images sont invalides.');

    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          content,
          coverImageUrl: data.coverImageUrl,
          audioUrl: data.audioUrl,
          visibility: data.visibility,
          authorId: actor.sub,
          status: 'ACTIVE',
          attachments: imageUploadIds.length
            ? {
                create: imageUploadIds.map((uploadId, position) => ({
                  uploadId,
                  position,
                  kind: 'IMAGE',
                })),
              }
            : undefined,
        },
      });
      await syncPostMentions(tx, created.id, actor.sub, content);
      await tx.auditLog.create({
        data: {
          actorId: actor.sub,
          action: 'POST_CREATED',
          entityType: 'post',
          entityId: created.id,
          metadata: { imageCount: imageUploadIds.length },
        },
      });
      return created;
    });
    if (post.visibility !== 'PRIVATE')
      await this.notifications.friendPosted(
        actor.sub,
        actor.username ?? '',
        post.id,
      );
    return post;
  }

  async update(
    id: string,
    data: UpdatePostInput,
    actorId: string,
  ): Promise<PostModel> {
    const post = await this.prisma.post.findFirst({
      where: { id, isDeleted: false },
    });
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.authorId !== actorId)
      throw new ForbiddenException(
        'Seul le propriétaire peut modifier cette publication.',
      );
    const safeData = { ...data };
    delete safeData.authorId;
    delete safeData.imageUploadIds;
    delete safeData.status;
    if (safeData.content !== undefined && !safeData.content?.trim()) {
      const imageCount = await this.prisma.postAttachment.count({
        where: { postId: id, kind: 'IMAGE', isDeleted: false },
      });
      if (imageCount === 0)
        throw new BadRequestException(
          'Une publication doit contenir du texte ou une image.',
        );
      safeData.content = null;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.post.update({ where: { id }, data: safeData });
      if (safeData.content !== undefined)
        await syncPostMentions(tx, id, actorId, safeData.content);
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'POST_UPDATED',
          entityType: 'post',
          entityId: id,
          metadata: {},
        },
      });
      return updated;
    });
  }

  async delete(id: string, actorId: string): Promise<PostModel> {
    const post = await this.prisma.post.findFirst({
      where: { id, isDeleted: false },
    });
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.authorId !== actorId)
      throw new ForbiddenException(
        'Seul le propriétaire peut supprimer cette publication.',
      );
    const result = await this.prisma.$transaction(async (tx) => {
      const attachments = await tx.postAttachment.findMany({
        where: { postId: id, isDeleted: false },
        select: { uploadId: true },
      });
      const deleted = await tx.post.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date(), status: 'DELETED' },
      });
      await tx.postAttachment.updateMany({
        where: { postId: id, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      await tx.postMention.updateMany({
        where: { postId: id, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      const uploadIds: string[] = [];
      for (const { uploadId } of attachments) {
        const references = await tx.postAttachment.count({
          where: { uploadId, isDeleted: false },
        });
        if (references === 0) {
          await tx.upload.updateMany({
            where: { id: uploadId, isDeleted: false },
            data: {
              isDeleted: true,
              deletedAt: new Date(),
              status: 'DELETED',
              cleanupPending: true,
            },
          });
          uploadIds.push(uploadId);
        }
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'POST_DELETED',
          entityType: 'post',
          entityId: id,
          metadata: {},
        },
      });
      return { deleted, uploadIds };
    });
    await this.uploadCleanup.processPending(result.uploadIds);
    return result.deleted;
  }
}
