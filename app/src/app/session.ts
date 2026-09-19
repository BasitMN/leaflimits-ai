import { Injectable, signal } from '@angular/core';
import { readStored, writeStored } from './storage';

@Injectable({ providedIn: 'root' })
export class Session {
  readonly token = signal(readStored('ll_token') ?? '');
  readonly device = signal(readStored('ll_device') ?? 'esp32s3-01');

  update(token: string, device: string): void {
    this.token.set(token.trim());
    this.device.set(device.trim() || 'esp32s3-01');
    writeStored('ll_token', this.token() || null);
    writeStored('ll_device', this.device());
  }
}
