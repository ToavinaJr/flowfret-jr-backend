import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { AZURE_OPENAI_CHAT_HTTP_TIMEOUT_MS } from './azure-openai.constants';
import { AzureChatService } from './azure-chat.service';

@Module({
  imports: [
    HttpModule.register({ timeout: AZURE_OPENAI_CHAT_HTTP_TIMEOUT_MS }),
  ],
  providers: [AzureChatService],
  exports: [AzureChatService],
})
export class AzureOpenAiModule {}
