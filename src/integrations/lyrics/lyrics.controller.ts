import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ReportStatus, UserRole } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { RateLimits } from '../../auth/rate-limit.decorator';
import { Roles } from '../../auth/roles.decorator';
import { GetLyricsDto } from './dto/get-lyrics.dto';
import { ReportLyricsDto } from './dto/report-lyrics.dto';
import { UpdateLyricsOverrideDto } from './dto/update-lyrics-override.dto';
import { UpdateLyricsReportStatusDto } from './dto/update-lyrics-report-status.dto';
import { LyricsOverrideService } from './lyrics-override.service';
import { LyricsReportsService } from './lyrics-reports.service';
import { LyricsService } from './lyrics.service';

type AuthRequest = { user: { sub: string } };

@Controller('api/lyrics')
export class LyricsController {
  constructor(
    private readonly lyrics: LyricsService,
    private readonly reports: LyricsReportsService,
    private readonly overrides: LyricsOverrideService,
  ) {}

  @Get()
  @Public()
  @RateLimits(
    { limit: 30, windowSeconds: 60, failClosed: true },
    { limit: 500, windowSeconds: 86_400, failClosed: true },
  )
  async get(@Query() query: GetLyricsDto) {
    const result = await this.lyrics.findLyrics({
      id: query.trackId,
      title: query.title,
      artist: query.artist,
      album: query.album,
      duration: query.duration,
      provider: query.provider,
    });
    if (!result) throw new NotFoundException('Lyrics unavailable');
    return result;
  }

  @Post('report')
  @RateLimits({ limit: 10, windowSeconds: 3600, failClosed: true })
  report(@Body() dto: ReportLyricsDto, @Req() req: AuthRequest) {
    return this.reports.createReport(
      {
        provider: dto.provider,
        trackId: dto.trackId,
        title: dto.title,
        artist: dto.artist,
      },
      req.user.sub,
      dto.reason,
      dto.proposedLyrics,
    );
  }

  @Get('reports')
  @Roles(UserRole.ADMIN)
  listReports(
    @Query('status') status?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const parsedStatus =
      status && (Object.values(ReportStatus) as string[]).includes(status)
        ? (status as ReportStatus)
        : undefined;
    return this.reports.listReports(
      parsedStatus,
      Number(take ?? 20),
      Number(skip ?? 0),
    );
  }

  @Put('reports/:id')
  @Roles(UserRole.ADMIN)
  updateReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLyricsReportStatusDto,
  ) {
    return this.reports.updateReportStatus(id, dto.status);
  }

  @Get('override')
  @Roles(UserRole.ADMIN)
  async getOverride(
    @Query('provider') provider: string,
    @Query('trackId') trackId: string,
    @Query('title') title: string,
    @Query('artist') artist: string,
  ) {
    const result = await this.lyrics.findLyrics({
      id: trackId,
      provider,
      title,
      artist,
    });
    if (!result) throw new NotFoundException('Lyrics unavailable');
    return result;
  }

  @Put('override')
  @Roles(UserRole.ADMIN)
  saveOverride(@Body() dto: UpdateLyricsOverrideDto, @Req() req: AuthRequest) {
    return this.overrides.save(dto, req.user.sub);
  }
}
