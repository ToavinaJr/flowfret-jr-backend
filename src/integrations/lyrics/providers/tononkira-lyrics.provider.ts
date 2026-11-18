import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { lookup } from 'node:dns/promises';
import { Agent as HttpsAgent } from 'node:https';
import { BlockList, isIP } from 'node:net';
import * as cheerio from 'cheerio';
import { firstValueFrom } from 'rxjs';
import { estimateLyricsTiming } from '../estimate-lyrics-timing.util';
import {
  LYRICS_WEB_PAGE_TIMEOUT_MS,
  LYRICS_WEB_USER_AGENT,
} from '../lyrics.constants';
import type { LyricsProvider } from '../interfaces/lyrics-provider.interface';
import type { Lyrics, TrackMetadata } from '../interfaces/lyrics.interface';

const TONONKIRA_BASE_URL = 'https://tononkira.serasera.org';
const TONONKIRA_HOST = 'tononkira.serasera.org';
const MAX_TONONKIRA_PAGE_BYTES = 1_000_000;
const blockedIpv4Addresses = new BlockList();
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) =>
  blockedIpv4Addresses.addSubnet(address as string, prefix as number, 'ipv4'),
);
const blockedIpv6Addresses = new BlockList();
[
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([address, prefix]) =>
  blockedIpv6Addresses.addSubnet(address as string, prefix as number, 'ipv6'),
);
const TONONKIRA_SOURCE =
  /(?:\s*(?:nalaina\s+tao\s+amin['’]ny|from|via|source:?\s*)\s*)?tononkira\.serasera\.org/giu;
const SECTION_HEADING =
  /^\s*(?:(?:\[|\(|\{|-)\s*)?(?:refrain|bridge)\s*(?:\]|\)|\}|:|-)?\s*$/iu;

/**
 * Dedicated source for Malagasy ("gasy") lyrics, which LRCLIB/Genius rarely
 * cover. URLs are guessed deterministically from the artist/title
 * (https://tononkira.serasera.org/hira/{artist-slug}/{title-slug}); a wrong
 * guess just 404s like any other miss, so no "is this Malagasy" detection
 * is needed up front.
 *
 * The site injects hidden "honeypot" spans (aria-hidden, display:none) full
 * of random characters into the lyrics text to poison naive copy/paste or
 * scraping — they're stripped before reading the text. The lyrics container
 * itself has a page-specific, unpredictable id, but it reliably sits right
 * after the "(Nalaina tao amin'ny tononkira.serasera.org)" print byline, so
 * that DOM relationship is used instead of the id.
 */
@Injectable()
export class TononkiraLyricsProvider implements LyricsProvider {
  private readonly logger = new Logger(TononkiraLyricsProvider.name);

  constructor(private readonly http: HttpService) {}

  async findLyrics(track: TrackMetadata): Promise<Lyrics | null> {
    const artistSlug = this.slugify(track.artist);
    const titleSlug = this.slugify(track.title);
    if (!artistSlug || !titleSlug) return null;

    const url = `${TONONKIRA_BASE_URL}/hira/${artistSlug}/${titleSlug}`;
    const lines = await this.fetchLines(url);
    if (!lines) return null;
    this.logger.log(
      `Tononkira lyrics found for ${track.artist} - ${track.title}`,
    );
    const synced = typeof track.duration === 'number' && track.duration > 0;
    return {
      provider: 'tononkira',
      synced,
      instrumental: false,
      plainLyrics: lines.join('\n'),
      lines: synced
        ? estimateLyricsTiming(lines, track.duration as number)
        : lines.map((text) => ({ startTimeMs: null, text })),
    };
  }

  /**
   * Lets an admin import lyrics from a Tononkira URL they found manually.
   * The deterministic artist/title slug guess in findLyrics() only works
   * when the track's known title/artist match the page's exact spelling —
   * for a YouTube video titled differently than the Tononkira page (a
   * common mismatch for Malagasy covers/uploads), guessing can never find
   * it, so the admin pastes the real URL instead.
   */
  async fetchFromUrl(url: string): Promise<string[] | null> {
    if (!this.isTononkiraUrl(url)) return null;
    return this.fetchLines(url);
  }

  private isTononkiraUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === 'https:' &&
        parsed.hostname === TONONKIRA_HOST &&
        parsed.port === '' &&
        !parsed.username &&
        !parsed.password &&
        !parsed.search &&
        !parsed.hash &&
        /^\/hira\/[a-z0-9-]+\/[a-z0-9-]+\/?$/u.test(parsed.pathname)
      );
    } catch {
      return false;
    }
  }

  private async fetchLines(url: string): Promise<string[] | null> {
    try {
      const address = await this.resolvePublicAddress();
      const httpsAgent = new HttpsAgent({
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
      });
      const response = await firstValueFrom(
        this.http.get<string>(url, {
          headers: { 'User-Agent': LYRICS_WEB_USER_AGENT },
          timeout: LYRICS_WEB_PAGE_TIMEOUT_MS,
          responseType: 'text',
          maxRedirects: 0,
          maxContentLength: MAX_TONONKIRA_PAGE_BYTES,
          maxBodyLength: MAX_TONONKIRA_PAGE_BYTES,
          httpsAgent,
          proxy: false,
        }),
      );
      const lines = this.extractLines(response.data);
      return lines.length > 0 ? lines : null;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        // Expected: this track just isn't on Tononkira.
      } else if (error instanceof AxiosError && error.code === 'ECONNABORTED') {
        this.logger.warn('Tononkira request timeout');
      } else {
        this.logger.warn(
          `Tononkira request failed (status=${error instanceof AxiosError ? (error.response?.status ?? 'network') : 'invalid'})`,
        );
      }
      return null;
    }
  }

  private async resolvePublicAddress() {
    const addresses = await lookup(TONONKIRA_HOST, {
      all: true,
      verbatim: true,
    });
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => !isPublicInternetAddress(address))
    ) {
      throw new Error('Tononkira resolved to a non-public address');
    }
    // Pin the validated result into the HTTPS agent so a second DNS lookup
    // cannot rebind the connection to a private or reserved address.
    return addresses.find(({ family }) => family === 4) ?? addresses[0];
  }

  private extractLines(html: string): string[] {
    const $ = cheerio.load(html);
    $('[aria-hidden="true"]').remove();
    const container = $('div.print.fst-italic').next('div');
    if (container.length === 0) return [];
    container.find('br').replaceWith('\n');
    return container
      .text()
      .split('\n')
      .map((line) => line.trim())
      .map((line) =>
        line
          .replace(TONONKIRA_SOURCE, '')
          .replace(/^[\s([{-]+|[\s)\]}:.-]+$/g, '')
          .trim(),
      )
      .filter((line) => !SECTION_HEADING.test(line))
      .filter((line) => line.length > 0);
  }

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}

export function isPublicInternetAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedIpv4Addresses.check(address, 'ipv4');
  if (family === 6) return !blockedIpv6Addresses.check(address, 'ipv6');
  return false;
}
