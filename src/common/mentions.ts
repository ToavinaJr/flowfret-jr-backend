import { FriendshipStatus, Prisma, UserStatus } from '@prisma/client';

const MENTION_PATTERN = /(^|[^\p{L}\p{N}._%+-])@([\p{L}\p{N}_]{1,50})/gu;
const MAX_MENTIONS = 10;

export function extractMentionUsernames(
  content: string | null | undefined,
): string[] {
  if (!content) return [];
  const usernames: string[] = [];
  for (const match of content.normalize('NFKC').matchAll(MENTION_PATTERN)) {
    const username = match[2];
    if (
      !usernames.some((item) => item.toLowerCase() === username.toLowerCase())
    )
      usernames.push(username);
    if (usernames.length === MAX_MENTIONS) break;
  }
  return usernames;
}

async function mentionedFriendIds(
  tx: Prisma.TransactionClient,
  actorId: string,
  content: string | null | undefined,
): Promise<string[]> {
  const usernames = extractMentionUsernames(content);
  if (!usernames.length) return [];

  const friendships = await tx.friendship.findMany({
    where: {
      status: FriendshipStatus.ACCEPTED,
      isDeleted: false,
      OR: [{ requesterId: actorId }, { receiverId: actorId }],
    },
    select: { requesterId: true, receiverId: true },
  });
  const allowedIds = new Set<string>([actorId]);
  for (const friendship of friendships) {
    allowedIds.add(
      friendship.requesterId === actorId
        ? friendship.receiverId
        : friendship.requesterId,
    );
  }

  const users = await tx.user.findMany({
    where: {
      id: { in: [...allowedIds] },
      status: UserStatus.ACTIVE,
      isDeleted: false,
      OR: usernames.map((username) => ({
        username: { equals: username, mode: 'insensitive' },
      })),
    },
    select: { id: true, username: true },
  });
  const byUsername = new Map(
    users.map((user) => [user.username.toLowerCase(), user.id]),
  );
  return usernames
    .map((username) => byUsername.get(username.toLowerCase()))
    .filter((id): id is string => Boolean(id));
}

export async function syncPostMentions(
  tx: Prisma.TransactionClient,
  postId: string,
  actorId: string,
  content: string | null | undefined,
): Promise<void> {
  const userIds = await mentionedFriendIds(tx, actorId, content);
  await tx.postMention.updateMany({
    where: {
      postId,
      isDeleted: false,
      ...(userIds.length ? { userId: { notIn: userIds } } : {}),
    },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  await Promise.all(
    userIds.map((userId) =>
      tx.postMention.upsert({
        where: { postId_userId: { postId, userId } },
        create: { postId, userId },
        update: { isDeleted: false, deletedAt: null },
      }),
    ),
  );
}

export async function syncCommentMentions(
  tx: Prisma.TransactionClient,
  commentId: string,
  actorId: string,
  content: string,
): Promise<void> {
  const userIds = await mentionedFriendIds(tx, actorId, content);
  await tx.commentMention.updateMany({
    where: {
      commentId,
      isDeleted: false,
      ...(userIds.length ? { userId: { notIn: userIds } } : {}),
    },
    data: { isDeleted: true, deletedAt: new Date() },
  });
  await Promise.all(
    userIds.map((userId) =>
      tx.commentMention.upsert({
        where: { commentId_userId: { commentId, userId } },
        create: { commentId, userId },
        update: { isDeleted: false, deletedAt: null },
      }),
    ),
  );
}
