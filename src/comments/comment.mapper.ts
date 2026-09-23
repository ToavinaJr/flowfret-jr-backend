import { CommentModel, UserModel } from '../graphql/graphql.types';

type CommentWithMentions = Record<string, unknown> & {
  mentions: Array<{ user: UserModel }>;
};

export function toCommentModel(row: CommentWithMentions): CommentModel {
  const { mentions, ...comment } = row;
  return {
    ...comment,
    mentionedUsers: mentions.map(({ user }) => user),
  } as CommentModel;
}
