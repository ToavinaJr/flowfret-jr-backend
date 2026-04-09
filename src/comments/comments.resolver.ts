import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
  Query,
} from '@nestjs/graphql';
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
    return this.prisma.comment.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Query(() => CommentModel, { name: 'comment', nullable: true })
  async comment(@Args('id') id: string): Promise<CommentModel | null> {
    return this.prisma.comment.findUnique({ where: { id } });
  }

  @Mutation(() => CommentModel)
  async createComment(
    @Args('data') data: CreateCommentInput,
  ): Promise<CommentModel> {
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
  ): Promise<CommentModel> {
    return this.prisma.comment.update({ where: { id }, data });
  }

  @Mutation(() => CommentModel)
  async deleteComment(@Args('id') id: string): Promise<CommentModel> {
    return this.prisma.$transaction(async (tx) => {
      const deletedComment = await tx.comment.delete({ where: { id } });

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
