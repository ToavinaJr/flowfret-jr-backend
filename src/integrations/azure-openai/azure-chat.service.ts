import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  AZURE_OPENAI_API_KEY_KEY,
  AZURE_OPENAI_CHAT_DEPLOYMENT_KEY,
  AZURE_OPENAI_CHAT_HTTP_TIMEOUT_MS,
  AZURE_OPENAI_DEFAULT_CHAT_API_VERSION,
  AZURE_OPENAI_ENDPOINT_KEY,
  LYRICS_EXTRACTION_NOT_FOUND,
  LYRICS_EXTRACTION_SYSTEM_PROMPT,
} from './azure-openai.constants';

interface AzureChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Strictly an extraction tool: it is only ever given text already fetched
 * from a real web page and asked to pull out a verbatim subset of it (never
 * prompted to produce lyrics from its own training data). Callers are
 * responsible for verifying the output is actually grounded in the
 * supplied page text before trusting it.
 */
@Injectable()
export class AzureChatService {
  private readonly logger = new Logger(AzureChatService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async extractLyrics(
    pageText: string,
    track: { title: string; artist: string },
  ): Promise<string | null> {
    const endpoint = this.config.get<string>(AZURE_OPENAI_ENDPOINT_KEY)?.trim();
    const apiKey = this.config.get<string>(AZURE_OPENAI_API_KEY_KEY)?.trim();
    const deployment = this.config
      .get<string>(AZURE_OPENAI_CHAT_DEPLOYMENT_KEY)
      ?.trim();
    if (!endpoint || !apiKey || !deployment) return null;

    const apiVersion =
      this.config.get<string>('AZURE_OPENAI_CHAT_API_VERSION')?.trim() ||
      AZURE_OPENAI_DEFAULT_CHAT_API_VERSION;
    const url = `${endpoint.replace(/\/+$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

    try {
      const response = await firstValueFrom(
        this.http.post<AzureChatCompletionResponse>(
          url,
          {
            temperature: 0,
            messages: [
              { role: 'system', content: LYRICS_EXTRACTION_SYSTEM_PROMPT },
              {
                role: 'user',
                content: `Song: "${track.title}" by "${track.artist}"\n\nPage text:\n${pageText}`,
              },
            ],
          },
          {
            headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
            timeout: AZURE_OPENAI_CHAT_HTTP_TIMEOUT_MS,
          },
        ),
      );
      const content = response.data.choices?.[0]?.message?.content?.trim();
      if (!content || content === LYRICS_EXTRACTION_NOT_FOUND) return null;
      return content;
    } catch (error) {
      if (error instanceof AxiosError && error.code === 'ECONNABORTED')
        this.logger.warn('Azure OpenAI chat timeout');
      else
        this.logger.warn(
          `Azure OpenAI chat request failed (status=${error instanceof AxiosError ? (error.response?.status ?? 'network') : 'invalid'})`,
        );
      return null;
    }
  }
}
