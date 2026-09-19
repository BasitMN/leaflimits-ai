import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, delay, map, of } from 'rxjs';
import { LiveStatus, Profile, Suggestion, MEASUREMENTS, classify } from './models';
import { readStored, writeStored } from './storage';

/**
 * The contract with the Node-RED "LeafLimits" flow. All URLs are relative to the page, so the app works
 * under any path (for example /leaflimits/) and any host.
 *
 *   GET  api/limits/:device   -> Profile
 *   PUT  api/limits/:device   -> Profile        (body: Profile)
 *   POST api/suggest          -> Suggestion     (body: { image: base64 jpeg, media_type: 'image/jpeg' })
 *   GET  api/status/:device   -> LiveStatus     (latest value and limit state per sensor)
 *
 * Every request carries "Authorization: Bearer <token>".
 */
export abstract class LimitsApi {
  abstract getProfile(device: string): Observable<Profile>;
  abstract saveProfile(profile: Profile): Observable<Profile>;
  abstract suggest(imageBase64: string): Observable<Suggestion>;
  abstract getStatus(device: string): Observable<LiveStatus>;
}

export class HttpLimitsApi extends LimitsApi {
  private readonly http = inject(HttpClient);

  getProfile(device: string) {
    return this.http.get<Profile>(`api/limits/${encodeURIComponent(device)}`);
  }
  saveProfile(profile: Profile) {
    return this.http.put<Profile>(`api/limits/${encodeURIComponent(profile.device_id)}`, profile);
  }
  suggest(imageBase64: string) {
    return this.http.post<Suggestion>('api/suggest', { image: imageBase64, media_type: 'image/jpeg' });
  }
  getStatus(device: string) {
    return this.http.get<LiveStatus>(`api/status/${encodeURIComponent(device)}`);
  }
}

/** In-memory fake backend so the app can be developed without Node-RED. Enable with ?mock=1 (or ?mock=0 to turn off). */
export class MockLimitsApi extends LimitsApi {
  private profile: Profile | null = null;

  getProfile(device: string) {
    return of<Profile>(
      this.profile ?? { device_id: device, plant: '', source: 'default', updated_at: null, limits: {} },
    ).pipe(delay(300));
  }

  saveProfile(profile: Profile) {
    this.profile = { ...profile, updated_at: new Date().toISOString() };
    return of(this.profile).pipe(delay(400));
  }

  suggest(_imageBase64: string) {
    return of<Suggestion>({
      plant: 'Basil (Ocimum basilicum)',
      confidence: 0.82,
      notes: 'Mock suggestion. Basil prefers warm, moderately humid air and water around 18 to 24 °C.',
      limits: {
        water_temperature: { min: 18, max: 24 },
        internal_temperature: { min: 18, max: 30 },
        internal_humidity: { min: 40, max: 70 },
      },
    }).pipe(delay(1500));
  }

  getStatus(_device: string) {
    const t = Date.now() / 1000;
    const wave = (base: number, amp: number, period: number) => +(base + amp * Math.sin((2 * Math.PI * t) / period)).toFixed(1);
    const values = {
      water_temperature: wave(21, 4, 90),
      internal_temperature: wave(24, 8, 120),
      internal_humidity: wave(55, 20, 150),
      external_temperature: wave(18, 3, 200),
    };
    return of(values).pipe(
      map((v) => {
        const out: LiveStatus = {};
        for (const m of MEASUREMENTS) {
          const value = v[m.key];
          out[m.key] = {
            value,
            unit: m.unit === '%' ? 'percent_rh' : 'celsius',
            state: classify(value, this.profile?.limits[m.key]),
            timestamp: new Date().toISOString(),
          };
        }
        return out;
      }),
    );
  }
}

export function isMockMode(): boolean {
  const q = new URLSearchParams(location.search).get('mock');
  if (q === '1') writeStored('ll_mock', '1');
  if (q === '0') writeStored('ll_mock', null);
  return q === '1' || readStored('ll_mock') === '1';
}
