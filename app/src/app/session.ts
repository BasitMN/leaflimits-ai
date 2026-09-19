import { Injectable, signal } from '@angular/core';
import { looksLikeApiKey } from './secrets';
import { readStored, writeStored } from './storage';

@Injectable({ providedIn: 'root' })
export class Session {
  readonly token = signal(this.loadToken());
  readonly device = signal(readStored('ll_device') ?? 'esp32s3-01');

  /** Self-heal: an API key that was stored by mistake is removed from the browser instead of being used. */
  private loadToken(): string {
    const stored = readStored('ll_token') ?? '';
    if (looksLikeApiKey(stored)) {
      writeStored('ll_token', null);
      return '';
    }
    return stored;
  }

  update(token: string, device: string): void {
    const clean = looksLikeApiKey(token) ? '' : token.trim();
    this.token.set(clean);
    this.device.set(device.trim() || 'esp32s3-01');
    writeStored('ll_token', clean || null);
    writeStored('ll_device', this.device());
  }
}
