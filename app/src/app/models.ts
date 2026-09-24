export type MeasurementKey =
  | 'internal_temperature'
  | 'internal_humidity'
  | 'external_temperature'
  | 'water_temperature';

export interface MeasurementMeta {
  key: MeasurementKey;
  label: string;
  unit: string;
  /** Same plausible range as PLAUSIBLE_RANGES in the Node-RED validation flow. Limits must stay inside it. */
  hardMin: number;
  hardMax: number;
}

export const MEASUREMENTS: readonly MeasurementMeta[] = [
  { key: 'water_temperature', label: 'Water temperature', unit: '°C', hardMin: 0, hardMax: 50 },
  { key: 'internal_temperature', label: 'Air temperature, inside', unit: '°C', hardMin: -10, hardMax: 60 },
  { key: 'internal_humidity', label: 'Humidity, inside', unit: '%', hardMin: 0, hardMax: 100 },
  { key: 'external_temperature', label: 'Air temperature, outside', unit: '°C', hardMin: -40, hardMax: 60 },
];

export interface Range {
  min: number;
  max: number;
}

export type Limits = Partial<Record<MeasurementKey, Range>>;

export interface Profile {
  device_id: string;
  plant: string;
  source: 'default' | 'ai' | 'manual';
  updated_at: string | null;
  limits: Limits;
}

export interface Suggestion {
  plant: string;
  /** 0 to 1 */
  confidence: number;
  notes: string;
  limits: Limits;
}

export type LimitState = 'ok' | 'low' | 'high' | 'unknown';

export interface LiveValue {
  value: number;
  unit: string;
  state: LimitState;
  timestamp: string;
}

export type LiveStatus = Partial<Record<MeasurementKey, LiveValue>>;

/** Classify one value against a range. The server does the real evaluation (with hysteresis). */
export function classify(value: number, range: Range | undefined): LimitState {
  if (!range) return 'unknown';
  if (value < range.min) return 'low';
  if (value > range.max) return 'high';
  return 'ok';
}
