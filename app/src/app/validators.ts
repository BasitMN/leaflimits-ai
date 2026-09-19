import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Limits, MEASUREMENTS, MeasurementMeta } from './models';

export type RangeProblem = 'incomplete' | 'notNumber' | 'order' | 'outOfBounds';

const blank = (v: unknown) => v === null || v === undefined || v === '';

/** Pure check of one min/max pair. Both blank means "no limit for this sensor". */
export function checkRange(meta: MeasurementMeta, min: unknown, max: unknown): RangeProblem | null {
  if (blank(min) && blank(max)) return null;
  if (blank(min) || blank(max)) return 'incomplete';
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 'notNumber';
  if (a >= b) return 'order';
  if (a < meta.hardMin || b > meta.hardMax) return 'outOfBounds';
  return null;
}

export function rangeGroupValidator(meta: MeasurementMeta): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const problem = checkRange(meta, group.get('min')?.value, group.get('max')?.value);
    return problem ? { [problem]: true } : null;
  };
}

export function problemText(meta: MeasurementMeta, errors: ValidationErrors | null): string {
  if (!errors) return '';
  if (errors['incomplete']) return 'Enter both a minimum and a maximum, or leave both empty.';
  if (errors['notNumber']) return 'Enter numbers only.';
  if (errors['order']) return 'The minimum must be lower than the maximum.';
  if (errors['outOfBounds']) return `Must stay between ${meta.hardMin} and ${meta.hardMax} ${meta.unit}.`;
  return '';
}

export type RangeFormValue = Record<string, { min: number | null; max: number | null }>;

export function formToLimits(value: RangeFormValue): Limits {
  const limits: Limits = {};
  for (const m of MEASUREMENTS) {
    const r = value[m.key];
    if (r && !blank(r.min) && !blank(r.max)) limits[m.key] = { min: Number(r.min), max: Number(r.max) };
  }
  return limits;
}

/** Problems for a whole Limits object, for example one returned by the AI. Empty array means valid. */
export function validateLimits(limits: Limits): string[] {
  const out: string[] = [];
  for (const m of MEASUREMENTS) {
    const r = limits[m.key];
    if (!r) continue;
    const p = checkRange(m, r.min, r.max);
    if (p) out.push(`${m.label}: ${p}`);
  }
  return out;
}
