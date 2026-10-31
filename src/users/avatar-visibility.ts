import { FriendshipStatus, ProfileVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The only rule deciding whether a viewer may see a user's avatar.
 * Owners always see their own avatar; PUBLIC profiles are visible to everyone;
 * FRIENDS profiles only to accepted friends; PRIVATE profiles to nobody else.
 */
export async function visibleAvatarUrl(
  prisma: PrismaService,
  ownerId: string,
  viewerId: string,
): Promise<string | null> {
  const profile = await prisma.profile.findFirst({
    where: { userId: ownerId, isDeleted: false },
    select: { avatarUrl: true, visibility: true },
  });
  if (!profile?.avatarUrl) return null;
  if (ownerId === viewerId || profile.visibility === ProfileVisibility.PUBLIC)
    return profile.avatarUrl;
  if (profile.visibility !== ProfileVisibility.FRIENDS) return null;
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: FriendshipStatus.ACCEPTED,
      isDeleted: false,
      OR: [
        { requesterId: ownerId, receiverId: viewerId },
        { requesterId: viewerId, receiverId: ownerId },
      ],
    },
    select: { id: true },
  });
  return friendship ? profile.avatarUrl : null;
}
