import { PostModel, UserModel } from '../graphql/graphql.types';

type FeedPost = Record<string, unknown> & {
  attachments: Array<
    Record<string, unknown> & {
      upload: Record<string, unknown> & {
        fileSize: bigint | number | string;
      };
    }
  >;
  likes: Array<{ id: string }>;
  mentions: Array<{ user: UserModel }>;
};

export function toPostModel(row: FeedPost): PostModel {
  const { likes, mentions, ...post } = row;
  return {
    ...post,
    attachments: post.attachments.map(({ upload, ...attachment }) => ({
      ...attachment,
      upload: { ...upload, fileSize: String(upload.fileSize) },
    })),
    viewerHasLiked: likes.length > 0,
    viewerLikeId: likes[0]?.id ?? null,
    mentionedUsers: mentions.map(({ user }) => user),
  } as PostModel;
}
