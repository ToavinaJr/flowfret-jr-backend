import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { finalize, Observable } from 'rxjs';

type UploadRequest = { user?: { sub?: string } };

@Injectable()
export class ConcurrentUploadsInterceptor implements NestInterceptor {
  private activeGlobal = 0;
  private readonly activeByUser = new Map<string, number>();
  private readonly globalLimit: number;
  private readonly userLimit: number;

  constructor(config: ConfigService) {
    this.globalLimit = this.positiveInteger(
      config.get('UPLOAD_MAX_CONCURRENT_GLOBAL'),
      4,
    );
    this.userLimit = this.positiveInteger(
      config.get('UPLOAD_MAX_CONCURRENT_PER_USER'),
      2,
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<UploadRequest>();
    const userId = request.user?.sub;
    if (!userId) throw new HttpException('Authentification requise.', 401);

    const activeForUser = this.activeByUser.get(userId) ?? 0;
    if (
      this.activeGlobal >= this.globalLimit ||
      activeForUser >= this.userLimit
    ) {
      throw new HttpException('Trop d’uploads simultanés.', 429);
    }

    this.activeGlobal += 1;
    this.activeByUser.set(userId, activeForUser + 1);
    return next.handle().pipe(finalize(() => this.release(userId)));
  }

  private release(userId: string): void {
    this.activeGlobal = Math.max(0, this.activeGlobal - 1);
    const remaining = (this.activeByUser.get(userId) ?? 1) - 1;
    if (remaining > 0) this.activeByUser.set(userId, remaining);
    else this.activeByUser.delete(userId);
  }

  private positiveInteger(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
