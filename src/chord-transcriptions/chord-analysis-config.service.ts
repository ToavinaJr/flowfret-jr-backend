import { Injectable, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';

@Injectable()
export class ChordAnalysisConfigService implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (!this.enabled) return;
    for (const asset of ['btc/btc_model.py', 'btc/test/btc_model_large_voca.pt', 'beat-small0.ckpt']) {
      if (!existsSync(resolve(this.modelDirectory, asset))) {
        throw new Error(`CHORD_ANALYSIS_MODEL_DIR is missing ${asset}; run workers/chords/setup_models.py before enabling CHORD_ANALYSIS_ENABLED`);
      }
    }
  }

  get enabled(): boolean {
    return String(this.config.get('CHORD_ANALYSIS_ENABLED') ?? 'false').toLowerCase() === 'true';
  }

  get python(): string {
    return this.config.get<string>('CHORD_ANALYSIS_PYTHON_BIN') || this.config.get<string>('WHISPER_PYTHON_BIN') || 'python3';
  }

  get timeoutMs(): number {
    return Number(this.config.get('CHORD_ANALYSIS_TIMEOUT_MS') ?? 900_000);
  }

  get modelDirectory(): string {
    return resolve(this.config.get<string>('CHORD_ANALYSIS_MODEL_DIR') || 'workers/chords/models');
  }
}
