import {
  Args,
  Context,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
  Query,
} from '@nestjs/graphql';
import { Int } from '@nestjs/graphql';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CommentModel,
  CreateCommentInput,
  PostModel,
  UpdateCommentInput,
  UserModel,
} from '../graphql/graphql.types';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => CommentModel)
export class CommentsResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [CommentModel], { name: 'comments' })
  async comments(): Promise<CommentModel[]> {
    return this.prisma.comment.findMany({ where: { isDeleted: false }, orderBy: { createdAt: 'desc' } });
  }

  @Query(() => CommentModel, { name: 'comment', nullable: true })
  async comment(@Args('id') id: string): Promise<CommentModel | null> {
    return this.prisma.comment.findFirst({ where: { id, isDeleted: false } });
  }

  @Query(() => [CommentModel], { name: 'commentsByPost' })
  async commentsByPost(
    @Args('postId') postId: string,
    @Args('skip', { type: () => Int, defaultValue: 0 }) skip: number,
    @Args('take', { type: () => Int, defaultValue: 20 }) take: number,
  ): Promise<CommentModel[]> {
    return this.prisma.comment.findMany({
      where: { postId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      skip: Math.max(0, skip),
      take: Math.min(50, Math.max(1, take)),
    });
  }

  @Mutation(() => CommentModel)
  async createComment(
    @Args('data') data: CreateCommentInput,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<CommentModel> {
    if (data.authorId !== context.req.user.sub) throw new ForbiddenException('Vous ne pouvez commenter qu’en votre nom.');
    const post = await this.prisma.post.findFirst({ where: { id: data.postId, isDeleted: false } });
    if (!post) throw new NotFoundException('Publication introuvable.');
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({ data });

      await tx.post.update({
        where: { id: data.postId },
        data: {
          commentCount: {
            increment: 1,
          },
        },
      });

      return comment;
    });
  }

  @Mutation(() => CommentModel)
  async updateComment(
    @Args('id') id: string,
    @Args('data') data: UpdateCommentInput,
    @Context() context: { req: { user: { sub: string } } },
  ): Promise<CommentModel> {
    const comment = await this.prisma.comment.findFirst({ where: { id, isDeleted: false } });
    if (!comment) throw new NotFoundException('Commentaire introuvable.');
    if (comment.authorId !== context.req.user.sub) throw new ForbiddenException('Seul le propriétaire peut modifier ce commentaire.');
    const { authorId: _authorId, postId: _postId, ...safeData } = data;
    return this.prisma.comment.update({ where: { id }, data: safeData });
  }

  @Mutation(() => CommentModel)
  async deleteComment(@Args('id') id: string, @Context() context: { req: { user: { sub: string } } }): Promise<CommentModel> {
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findFirst({ where: { id, isDeleted: false } });
      if (!comment) throw new NotFoundException('Commentaire introuvable.');
      if (comment.authorId !== context.req.user.sub) throw new ForbiddenException('Seul le propriétaire peut supprimer ce commentaire.');
      const deletedComment = await tx.comment.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date(), status: 'DELETED' } });

      await tx.post.updateMany({
        where: {
          id: deletedComment.postId,
          commentCount: {
            gt: 0,
          },
        },
        data: {
          commentCount: {
            decrement: 1,
          },
        },
      });

      return deletedComment;
    });
  }

  @ResolveField(() => PostModel, { name: 'post' })
  async post(@Parent() comment: CommentModel): Promise<PostModel | null> {
    return this.prisma.post.findUnique({ where: { id: comment.postId } });
  }

  @ResolveField(() => UserModel, { name: 'author' })
  async author(@Parent() comment: CommentModel): Promise<UserModel | null> {
    return this.prisma.user.findUnique({ where: { id: comment.authorId } });
  }
}
