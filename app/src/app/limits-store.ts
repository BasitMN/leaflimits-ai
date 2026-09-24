import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LimitsApi } from './limits-api';
import { LiveStatus, Profile, Suggestion } from './models';
import { Session } from './session';
import { validateLimits } from './validators';

export function describeError(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'Cannot reach the server. Check the connection and that Node-RED is running.';
    if (e.status === 401) return 'Wrong or missing access token. Set it under Settings.';
    if (e.status === 429) return 'Too many AI requests for now. Try again later or enter the limits by hand.';
    const msg = typeof e.error === 'object' && e.error ? (e.error as { message?: string }).message : undefined;
    return msg ?? `Server error (${e.status}).`;
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

@Injectable({ providedIn: 'root' })
export class LimitsStore {
  private readonly api = inject(LimitsApi);
  private readonly session = inject(Session);

  readonly profile = signal<Profile | null>(null);
  readonly status = signal<LiveStatus>({});
  /** Latest AI suggestion, kept between the Capture and Review screens. */
  readonly suggestion = signal<Suggestion | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  private async guard<T>(work: () => Promise<T>): Promise<T | undefined> {
    this.busy.set(true);
    this.error.set(null);
    try {
      return await work();
    } catch (e) {
      this.error.set(describeError(e));
      return undefined;
    } finally {
      this.busy.set(false);
    }
  }

  async loadProfile(): Promise<void> {
    await this.guard(async () => this.profile.set(await firstValueFrom(this.api.getProfile(this.session.device()))));
  }

  /** Polling: failures are silent so a short network drop does not flash an error every 5 seconds. */
  async refreshStatus(): Promise<void> {
    try {
      this.status.set(await firstValueFrom(this.api.getStatus(this.session.device())));
    } catch {
      /* keep the last known values */
    }
  }

  async analyze(imageBase64: string): Promise<Suggestion | undefined> {
    return this.guard(async () => {
      const s = await firstValueFrom(this.api.suggest(imageBase64));
      const problems = validateLimits(s.limits);
      if (problems.length) throw new Error(`The AI returned limits that are not usable (${problems.join('; ')}). Enter them by hand.`);
      this.suggestion.set(s);
      return s;
    });
  }

  async save(profile: Profile): Promise<Profile | undefined> {
    return this.guard(async () => {
      const saved = await firstValueFrom(this.api.saveProfile(profile));
      this.profile.set(saved);
      return saved;
    });
  }
}
