import { hash } from 'bcrypt';
import { PrismaClient, PostStatus, PostVisibility, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run Prisma seed');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

type FeedFixtureUser = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  bio: string;
};

type FeedFixturePost = {
  id: string;
  authorEmail: string;
  content: string;
  hoursAgo: number;
};

type FeedFixtureComment = {
  id: string;
  postId: string;
  authorEmail: string;
  content: string;
  minutesAgo: number;
};

type FeedFixtureLike = {
  postId: string;
  userEmail: string;
  minutesAgo: number;
};

const FEED_USERS: FeedFixtureUser[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'alex.riffs@example.com',
    username: 'alex_riffs',
    displayName: 'Alex Riffs',
    bio: 'Jazz and neo-soul voicings every day.',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'sara.guitar@example.com',
    username: 'sara.guitar',
    displayName: 'Sara Guitar',
    bio: 'Fingerstyle player and arrangement enthusiast.',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'blues.machine@example.com',
    username: 'blues_machine',
    displayName: 'Blues Machine',
    bio: '12-bar blues, bends and vintage tones.',
  },
];

const FEED_POSTS: FeedFixturePost[] = [
  {
    id: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    authorEmail: 'alex.riffs@example.com',
    content: 'Working on this jazzy progression. What do you think of the voicing on the Cmaj9?',
    hoursAgo: 2,
  },
  {
    id: 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    authorEmail: 'sara.guitar@example.com',
    content:
      'Finally nailed this fingerpicking pattern after weeks of practice. The key was slowing it down to 60 BPM first.',
    hoursAgo: 5,
  },
  {
    id: 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    authorEmail: 'blues.machine@example.com',
    content:
      'Classic 12-bar blues in A. Sometimes you just need to go back to basics. Added a quick turnaround at the end.',
    hoursAgo: 8,
  },
  {
    id: 'aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    authorEmail: 'alex.riffs@example.com',
    content: 'Exploring diminished arpeggios. Bdim7 creates great tension before resolving to C.',
    hoursAgo: 12,
  },
];

const FEED_COMMENTS: FeedFixtureComment[] = [
  {
    id: 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    postId: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    authorEmail: 'sara.guitar@example.com',
    content: 'Le voicing est superbe, surtout la tension sur la 9e.',
    minutesAgo: 35,
  },
  {
    id: 'bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    postId: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    authorEmail: 'blues.machine@example.com',
    content: 'Très smooth. Essaie aussi avec un petit passage en triton sub.',
    minutesAgo: 28,
  },
  {
    id: 'bbbbbbb3-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    postId: 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    authorEmail: 'alex.riffs@example.com',
    content: 'Propre. Le travail lent au métronome change tout.',
    minutesAgo: 55,
  },
  {
    id: 'bbbbbbb4-bbbb-4bbb-8bbb-bbbbbbbbbbb4',
    postId: 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    authorEmail: 'sara.guitar@example.com',
    content: 'Classique et efficace. Ton turnaround est top.',
    minutesAgo: 75,
  },
  {
    id: 'bbbbbbb5-bbbb-4bbb-8bbb-bbbbbbbbbbb5',
    postId: 'aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    authorEmail: 'blues.machine@example.com',
    content: 'Le Bdim7 vers C sonne vraiment bien ici.',
    minutesAgo: 95,
  },
];

const FEED_LIKES: FeedFixtureLike[] = [
  {
    postId: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    userEmail: 'sara.guitar@example.com',
    minutesAgo: 20,
  },
  {
    postId: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    userEmail: 'blues.machine@example.com',
    minutesAgo: 18,
  },
  {
    postId: 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    userEmail: 'alex.riffs@example.com',
    minutesAgo: 40,
  },
  {
    postId: 'aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    userEmail: 'blues.machine@example.com',
    minutesAgo: 38,
  },
  {
    postId: 'aaaaaaa3-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    userEmail: 'alex.riffs@example.com',
    minutesAgo: 65,
  },
  {
    postId: 'aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    userEmail: 'sara.guitar@example.com',
    minutesAgo: 80,
  },
];

const FEED_POST_IDS = new Set(FEED_POSTS.map((post) => post.id));
const FALLBACK_COMMENT_AUTHORS = [
  'alex.riffs@example.com',
  'sara.guitar@example.com',
  'blues.machine@example.com',
];

async function seedUsers(passwordHash: string): Promise<Map<string, string>> {
  const idsByEmail = new Map<string, string>();

  for (const user of FEED_USERS) {
    const saved = await prisma.user.upsert({
      where: { email: user.email },
      create: {
        id: user.id,
        email: user.email,
        username: user.username,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
      update: {
        username: user.username,
        status: UserStatus.ACTIVE,
      },
      select: { id: true, email: true },
    });

    idsByEmail.set(saved.email, saved.id);

    await prisma.profile.upsert({
      where: { userId: saved.id },
      create: {
        userId: saved.id,
        displayName: user.displayName,
        bio: user.bio,
      },
      update: {
        displayName: user.displayName,
        bio: user.bio,
      },
    });
  }

  return idsByEmail;
}

async function seedPosts(idsByEmail: Map<string, string>): Promise<void> {
  for (const post of FEED_POSTS) {
    const authorId = idsByEmail.get(post.authorEmail);

    if (!authorId) {
      throw new Error(`Missing author for fixture post ${post.id}`);
    }

    const createdAt = new Date(Date.now() - post.hoursAgo * 60 * 60 * 1000);

    await prisma.post.upsert({
      where: { id: post.id },
      create: {
        id: post.id,
        authorId,
        content: post.content,
        likeCount: 0,
        commentCount: 0,
        status: PostStatus.ACTIVE,
        visibility: PostVisibility.PUBLIC,
        createdAt,
      },
      update: {
        authorId,
        content: post.content,
        status: PostStatus.ACTIVE,
        visibility: PostVisibility.PUBLIC,
      },
    });
  }
}

async function seedCommentsAndLikes(idsByEmail: Map<string, string>): Promise<void> {
  for (const comment of FEED_COMMENTS) {
    const authorId = idsByEmail.get(comment.authorEmail);

    if (!authorId) {
      throw new Error(`Missing author for fixture comment ${comment.id}`);
    }

    const createdAt = new Date(Date.now() - comment.minutesAgo * 60 * 1000);

    await prisma.comment.upsert({
      where: { id: comment.id },
      create: {
        id: comment.id,
        postId: comment.postId,
        authorId,
        content: comment.content,
        createdAt,
      },
      update: {
        postId: comment.postId,
        authorId,
        content: comment.content,
      },
    });
  }

  for (const like of FEED_LIKES) {
    const userId = idsByEmail.get(like.userEmail);

    if (!userId) {
      throw new Error(`Missing user for fixture like ${like.postId}:${like.userEmail}`);
    }

    const createdAt = new Date(Date.now() - like.minutesAgo * 60 * 1000);

    await prisma.postLike.upsert({
      where: {
        postId_userId: {
          postId: like.postId,
          userId,
        },
      },
      create: {
        postId: like.postId,
        userId,
        createdAt,
      },
      update: {},
    });
  }
}

async function seedExistingPostFixtures(idsByEmail: Map<string, string>): Promise<void> {
  const extraPosts = await prisma.post.findMany({
    where: {
      status: PostStatus.ACTIVE,
      id: {
        notIn: FEED_POSTS.map((post) => post.id),
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
    },
  });

  for (const [index, post] of extraPosts.entries()) {
    const authorEmail = FALLBACK_COMMENT_AUTHORS[index % FALLBACK_COMMENT_AUTHORS.length];
    const likeEmail = FALLBACK_COMMENT_AUTHORS[(index + 1) % FALLBACK_COMMENT_AUTHORS.length];
    const authorId = idsByEmail.get(authorEmail);
    const likeUserId = idsByEmail.get(likeEmail);

    if (!authorId || !likeUserId) {
      continue;
    }

    const commentId = post.id;
    const createdAt = new Date(Date.now() - (15 + index * 7) * 60 * 1000);

    await prisma.comment.upsert({
      where: { id: commentId },
      create: {
        id: commentId,
        postId: post.id,
        authorId,
        content: 'Fixture de discussion ajoutée sur un poste existant.',
        createdAt,
      },
      update: {
        postId: post.id,
        authorId,
        content: 'Fixture de discussion ajoutée sur un poste existant.',
      },
    });

    await prisma.postLike.upsert({
      where: {
        postId_userId: {
          postId: post.id,
          userId: likeUserId,
        },
      },
      create: {
        postId: post.id,
        userId: likeUserId,
        createdAt,
      },
      update: {},
    });
  }
}

async function syncPostCounters(): Promise<void> {
  const posts = await prisma.post.findMany({
    where: {
      status: PostStatus.ACTIVE,
    },
    select: {
      id: true,
    },
  });

  for (const post of posts) {
    const [likeCount, commentCount] = await Promise.all([
      prisma.postLike.count({ where: { postId: post.id } }),
      prisma.comment.count({ where: { postId: post.id } }),
    ]);

    await prisma.post.update({
      where: { id: post.id },
      data: {
        likeCount,
        commentCount,
      },
    });
  }
}

async function main(): Promise<void> {
  const passwordHash = await hash('dev-password', 10);
  const userIds = await seedUsers(passwordHash);
  await seedPosts(userIds);
  await seedCommentsAndLikes(userIds);
  await seedExistingPostFixtures(userIds);
  await syncPostCounters();

  const [postCount, commentCount, likeCount] = await Promise.all([
    prisma.post.count({
      where: {
        id: {
          in: FEED_POSTS.map((post) => post.id),
        },
      },
    }),
    prisma.comment.count({
      where: {
        id: {
          in: FEED_COMMENTS.map((comment) => comment.id),
        },
      },
    }),
    prisma.postLike.count({
      where: {
        OR: FEED_LIKES.map((like) => ({
          postId: like.postId,
          user: { email: like.userEmail },
        })),
      },
    }),
  ]);

  console.log(`Feed fixtures ready (${postCount} posts, ${commentCount} comments, ${likeCount} likes).`);
}

main()
  .catch((error) => {
    console.error('Failed to seed feed fixtures:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
