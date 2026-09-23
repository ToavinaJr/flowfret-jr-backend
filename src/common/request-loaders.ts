import {
  CommentModel,
  PostAttachmentModel,
  PostLikeModel,
  PostModel,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';
import { BatchLoader } from './batch-loader';

export class RequestLoaders {
  readonly userById: BatchLoader<string, UserModel | null>;
  readonly postById: BatchLoader<string, PostModel | null>;
  readonly commentsByPostId: BatchLoader<string, CommentModel[]>;
  readonly likesByPostId: BatchLoader<string, PostLikeModel[]>;
  readonly attachmentsByPostId: BatchLoader<string, PostAttachmentModel[]>;
  readonly postMentions: BatchLoader<string, UserModel[]>;
  readonly commentMentions: BatchLoader<string, UserModel[]>;

  constructor(prisma: PrismaService) {
    this.userById = new BatchLoader(
      async (ids) => {
        const users = await prisma.user.findMany({
          where: { id: { in: [...ids] } },
        });
        return new Map(users.map((user) => [user.id, user]));
      },
      () => null,
    );
    this.postById = new BatchLoader(
      async (ids) => {
        const posts = await prisma.post.findMany({
          where: { id: { in: [...ids] } },
        });
        return new Map(posts.map((post) => [post.id, post]));
      },
      () => null,
    );
    this.commentsByPostId = new BatchLoader(
      async (postIds) => {
        const comments = await prisma.comment.findMany({
          where: { postId: { in: [...postIds] }, isDeleted: false },
          orderBy: { createdAt: 'desc' },
        });
        return grouped(postIds, comments, (comment) => comment.postId);
      },
      () => [],
    );
    this.likesByPostId = new BatchLoader(
      async (postIds) => {
        const likes = await prisma.postLike.findMany({
          where: { postId: { in: [...postIds] }, isDeleted: false },
          orderBy: { createdAt: 'desc' },
        });
        return grouped(postIds, likes, (like) => like.postId);
      },
      () => [],
    );
    this.attachmentsByPostId = new BatchLoader(
      async (postIds) => {
        const attachments = await prisma.postAttachment.findMany({
          where: { postId: { in: [...postIds] }, isDeleted: false },
          orderBy: { position: 'asc' },
        });
        return grouped(postIds, attachments, (attachment) => attachment.postId);
      },
      () => [],
    );
    this.postMentions = new BatchLoader(
      async (postIds) => {
        const mentions = await prisma.postMention.findMany({
          where: { postId: { in: [...postIds] }, isDeleted: false },
          include: { user: { include: { profile: true } } },
        });
        return grouped(
          postIds,
          mentions,
          (mention) => mention.postId,
          (mention) => mention.user,
        );
      },
      () => [],
    );
    this.commentMentions = new BatchLoader(
      async (commentIds) => {
        const mentions = await prisma.commentMention.findMany({
          where: { commentId: { in: [...commentIds] }, isDeleted: false },
          include: { user: { include: { profile: true } } },
        });
        return grouped(
          commentIds,
          mentions,
          (mention) => mention.commentId,
          (mention) => mention.user,
        );
      },
      () => [],
    );
  }
}

function grouped<Key, Row, Value = Row>(
  keys: readonly Key[],
  rows: readonly Row[],
  keyOf: (row: Row) => Key,
  valueOf: (row: Row) => Value = (row) => row as unknown as Value,
): Map<Key, Value[]> {
  const result = new Map(keys.map((key) => [key, [] as Value[]]));
  for (const row of rows) result.get(keyOf(row))?.push(valueOf(row));
  return result;
}

export type GraphqlRequestContext = {
  req: { user: { sub: string; username: string } };
  loaders?: RequestLoaders;
};
