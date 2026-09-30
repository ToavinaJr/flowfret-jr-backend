import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { adminCreatedAtRange } from './admin-pagination';
import { AdminManagedEntity } from './admin-entity.types';

type EntityConfig = {
  delegate: string;
  fields: readonly string[];
  keys: readonly string[];
  softDelete?: boolean;
  orderBy: string;
};
const ENTITY_CONFIG: Record<AdminManagedEntity, EntityConfig> = {
  [AdminManagedEntity.USER]: {
    delegate: 'user',
    fields: ['email', 'username'],
    keys: ['id'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.PROFILE]: {
    delegate: 'profile',
    fields: [
      'userId',
      'displayName',
      'avatarUrl',
      'bio',
      'location',
      'websiteUrl',
      'level',
      'visibility',
    ],
    keys: ['id'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.POST]: {
    delegate: 'post',
    fields: [
      'authorId',
      'content',
      'coverImageUrl',
      'audioUrl',
      'visibility',
      'status',
    ],
    keys: ['id'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.COMMENT]: {
    delegate: 'comment',
    fields: ['postId', 'authorId', 'content', 'status'],
    keys: ['id'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.FRIENDSHIP]: {
    delegate: 'friendship',
    fields: ['requesterId', 'receiverId', 'status'],
    keys: ['id'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.UPLOAD]: {
    delegate: 'upload',
    fields: [
      'userId',
      'fileName',
      'fileType',
      'fileSize',
      'storagePath',
      'storagePublicId',
      'cleanupPending',
      'duration',
      'status',
      'sourceType',
    ],
    keys: ['id'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.NOTIFICATION]: {
    delegate: 'notification',
    fields: ['userId', 'type', 'payload', 'readAt'],
    keys: ['id'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.NOTIFICATION_PREFERENCE]: {
    delegate: 'notificationPreference',
    fields: ['userId', 'type', 'enabled'],
    keys: ['userId', 'type'],
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.POST_LIKE]: {
    delegate: 'postLike',
    fields: ['postId', 'userId'],
    keys: ['id'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.POST_REPORT]: {
    delegate: 'postReport',
    fields: ['postId', 'reporterId', 'reason', 'status', 'reviewedAt'],
    keys: ['id'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.POST_MENTION]: {
    delegate: 'postMention',
    fields: ['postId', 'userId'],
    keys: ['postId', 'userId'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.COMMENT_MENTION]: {
    delegate: 'commentMention',
    fields: ['commentId', 'userId'],
    keys: ['commentId', 'userId'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.POST_ATTACHMENT]: {
    delegate: 'postAttachment',
    fields: ['postId', 'uploadId', 'kind', 'position'],
    keys: ['id'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.TRANSCRIPTION]: {
    delegate: 'transcription',
    fields: [
      'provider',
      'trackId',
      'title',
      'artist',
      'requestedLanguage',
      'detectedLanguage',
      'model',
      'engineVersion',
      'status',
      'progress',
      'bufferedUntil',
      'duration',
      'readyToPlay',
      'segments',
      'lrcContent',
      'errorCode',
      'errorMessage',
      'attempts',
      'manualRetryCount',
      'processingPhase',
      'completedAt',
    ],
    keys: ['id'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.CHORD_TRANSCRIPTION]: {
    delegate: 'chordTranscription',
    fields: [
      'provider',
      'providerTrackId',
      'title',
      'artist',
      'duration',
      'cues',
      'engineVersion',
    ],
    keys: ['id'],
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.LISTENING_HISTORY]: {
    delegate: 'listeningHistory',
    fields: [
      'userId',
      'provider',
      'providerTrackId',
      'title',
      'artists',
      'imageUrl',
      'externalUrl',
      'streamUrl',
      'album',
      'genre',
      'isrc',
      'durationMs',
      'playCount',
      'lastPlayedAt',
    ],
    keys: ['id'],
    orderBy: 'lastPlayedAt',
  },
  [AdminManagedEntity.CATALOG_TRACK]: {
    delegate: 'catalogTrack',
    fields: [
      'provider',
      'providerTrackId',
      'title',
      'artists',
      'album',
      'genre',
      'imageUrl',
      'externalUrl',
      'durationMs',
      'isrc',
    ],
    keys: ['id'],
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.PLAYLIST]: {
    delegate: 'playlist',
    fields: ['userId', 'name', 'description', 'coverUrl', 'visibility'],
    keys: ['id'],
    softDelete: true,
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.PLAYLIST_ITEM]: {
    delegate: 'playlistItem',
    fields: ['playlistId', 'trackId', 'addedById', 'position'],
    keys: ['id'],
    orderBy: 'createdAt',
  },
  [AdminManagedEntity.TRANSCRIPTION_ACCESS]: {
    delegate: 'transcriptionAccess',
    fields: ['userId', 'transcriptionId'],
    keys: ['userId', 'transcriptionId'],
    orderBy: 'createdAt',
  },
};

type DynamicDelegate = {
  findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  count(args: Record<string, unknown>): Promise<number>;
  create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  delete(args: Record<string, unknown>): Promise<Record<string, unknown>>;
};
type DynamicClient = Record<string, DynamicDelegate>;

@Injectable()
export class AdminEntityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    entity: AdminManagedEntity,
    first: number,
    skip: number,
    includeDeleted: boolean,
    from?: string,
    to?: string,
  ) {
    const config = ENTITY_CONFIG[entity];
    const delegate = this.getDelegate(
      this.prisma as unknown as DynamicClient,
      config,
    );
    const createdAt = adminCreatedAtRange(from, to);
    const where = {
      ...(config.softDelete && !includeDeleted ? { isDeleted: false } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [rows, totalCount] = await Promise.all([
      delegate.findMany({
        where,
        take: first,
        skip,
        orderBy: { [config.orderBy]: 'desc' },
      }),
      delegate.count({ where }),
    ]);
    return {
      nodes: rows.map((row) => this.serialize(row, config)),
      totalCount,
    };
  }

  async create(
    actorId: string,
    entity: AdminManagedEntity,
    data: unknown,
    rawReason: string,
  ) {
    const config = ENTITY_CONFIG[entity];
    const cleanData = this.sanitizeData(data, config);
    return this.mutate(
      actorId,
      entity,
      'CREATE',
      rawReason,
      async (client) => {
        const row = await this.getDelegate(client, config).create({
          data: cleanData,
        });
        return this.serialize(row, config);
      },
      undefined,
      Object.keys(cleanData),
    );
  }

  async update(
    actorId: string,
    entity: AdminManagedEntity,
    recordId: string,
    data: unknown,
    rawReason: string,
  ) {
    const config = ENTITY_CONFIG[entity];
    const where = this.decodeId(recordId, config);
    const cleanData = this.sanitizeData(data, config, false);
    return this.mutate(
      actorId,
      entity,
      'UPDATE',
      rawReason,
      async (client) => {
        const delegate = this.getDelegate(client, config);
        const current = await delegate.findMany({ where, take: 1 });
        if (!current.length)
          throw new NotFoundException('ADMIN_ENTITY_NOT_FOUND');
        const row = await delegate.update({ where, data: cleanData });
        return this.serialize(row, config);
      },
      recordId,
      Object.keys(cleanData),
    );
  }

  async delete(
    actorId: string,
    entity: AdminManagedEntity,
    recordId: string,
    rawReason: string,
  ) {
    if (entity === AdminManagedEntity.USER)
      throw new BadRequestException('ADMIN_USE_SECURE_ACCOUNT_ACTION');
    const config = ENTITY_CONFIG[entity];
    const where = this.decodeId(recordId, config);
    return this.mutate(
      actorId,
      entity,
      'DELETE',
      rawReason,
      async (client) => {
        const delegate = this.getDelegate(client, config);
        const rows = await delegate.findMany({ where, take: 1 });
        if (!rows.length) throw new NotFoundException('ADMIN_ENTITY_NOT_FOUND');
        if (config.softDelete) {
          const data = {
            isDeleted: true,
            deletedAt: new Date(),
            ...(entity === AdminManagedEntity.UPLOAD
              ? { cleanupPending: true }
              : {}),
          };
          const row = await delegate.update({
            where,
            data,
          });
          return this.serialize(row, config);
        }
        const row = await delegate.delete({ where });
        return this.serialize(row, config);
      },
      recordId,
    );
  }

  async restore(
    actorId: string,
    entity: AdminManagedEntity,
    recordId: string,
    rawReason: string,
  ) {
    const config = ENTITY_CONFIG[entity];
    if (!config.softDelete)
      throw new BadRequestException('ADMIN_ENTITY_NOT_RESTORABLE');
    const where = this.decodeId(recordId, config);
    return this.mutate(
      actorId,
      entity,
      'RESTORE',
      rawReason,
      async (client) => {
        const delegate = this.getDelegate(client, config);
        const rows = await delegate.findMany({ where, take: 1 });
        if (!rows.length) throw new NotFoundException('ADMIN_ENTITY_NOT_FOUND');
        const row = await delegate.update({
          where,
          data: { isDeleted: false, deletedAt: null },
        });
        return this.serialize(row, config);
      },
      recordId,
    );
  }

  private async mutate<T>(
    actorId: string,
    entity: AdminManagedEntity,
    verb: string,
    rawReason: string,
    operation: (client: DynamicClient) => Promise<T>,
    recordId?: string,
    changedFields: string[] = [],
  ) {
    const reason = rawReason.trim();
    if (reason.length < 3)
      throw new BadRequestException('ADMIN_REASON_REQUIRED');
    return this.prisma.$transaction(async (tx) => {
      const result = await operation(tx as unknown as DynamicClient);
      const resultId =
        result &&
        typeof result === 'object' &&
        '_adminId' in result &&
        typeof result._adminId === 'string'
          ? result._adminId
          : undefined;
      const auditedRecordId = recordId ?? resultId;
      const entityId =
        auditedRecordId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          auditedRecordId,
        )
          ? auditedRecordId
          : null;
      await tx.auditLog.create({
        data: {
          actorId,
          action: `ADMIN_${entity}_${verb}`,
          entityType: entity,
          entityId,
          metadata: {
            reason,
            recordId: auditedRecordId ?? null,
            fields: changedFields,
          } satisfies Prisma.InputJsonObject,
        },
      });
      return result;
    });
  }

  private sanitizeData(
    value: unknown,
    config: EntityConfig,
    allowKeys = true,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new BadRequestException('ADMIN_ENTITY_DATA_INVALID');
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length)
      throw new BadRequestException('ADMIN_ENTITY_DATA_EMPTY');
    const allowed = new Set(
      config.fields.filter(
        (field) => allowKeys || !config.keys.includes(field),
      ),
    );
    const invalid = entries.find(([key]) => !allowed.has(key));
    if (invalid)
      throw new BadRequestException(
        `ADMIN_ENTITY_FIELD_NOT_ALLOWED:${invalid[0]}`,
      );
    const data = Object.fromEntries(entries);
    if (
      'fileSize' in data &&
      typeof data.fileSize === 'string' &&
      /^\d+$/.test(data.fileSize)
    )
      data.fileSize = BigInt(data.fileSize);
    for (const key of ['readAt', 'reviewedAt', 'completedAt', 'lastPlayedAt']) {
      if (typeof data[key] === 'string') {
        const date = new Date(data[key]);
        if (Number.isNaN(date.getTime()))
          throw new BadRequestException(`ADMIN_ENTITY_DATE_INVALID:${key}`);
        data[key] = date;
      }
    }
    return data;
  }

  private decodeId(
    recordId: string,
    config: EntityConfig,
  ): Record<string, unknown> {
    const parts = recordId.split('|');
    if (parts.length !== config.keys.length || parts.some((part) => !part))
      throw new BadRequestException('ADMIN_ENTITY_ID_INVALID');
    const keyValues = Object.fromEntries(
      config.keys.map((key, index) => [key, parts[index]]),
    );
    return config.keys.length > 1
      ? { [config.keys.join('_')]: keyValues }
      : keyValues;
  }

  private serialize(
    row: Record<string, unknown>,
    config: EntityConfig,
  ): Record<string, unknown> {
    const safeRow = { ...row };
    if (config.delegate === 'user') {
      delete safeRow.passwordHash;
      delete safeRow.googleId;
    }
    const withId = {
      ...safeRow,
      _adminId: config.keys.map((key) => String(row[key])).join('|'),
    };
    return JSON.parse(
      JSON.stringify(withId, (_key, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    ) as Record<string, unknown>;
  }

  private getDelegate(
    client: DynamicClient,
    config: EntityConfig,
  ): DynamicDelegate {
    const delegate = client[config.delegate];
    if (!delegate) throw new BadRequestException('ADMIN_ENTITY_UNSUPPORTED');
    return delegate;
  }
}
