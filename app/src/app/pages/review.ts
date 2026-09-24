import { PercentPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LimitsStore } from '../limits-store';
import { MEASUREMENTS, MeasurementMeta, Profile } from '../models';
import { Session } from '../session';
import { RangeFormValue, formToLimits, problemText, rangeGroupValidator } from '../validators';

type RangeGroup = FormGroup<{ min: FormControl<number | null>; max: FormControl<number | null> }>;

@Component({
  selector: 'app-review',
  imports: [ReactiveFormsModule, RouterLink, PercentPipe],
  template: `
    @if (suggestion; as s) {
      <section class="card notice-card">
        <h2>Suggested by AI</h2>
        <p><strong>{{ s.plant }}</strong> · confidence {{ s.confidence | percent }}</p>
        @if (s.notes) { <p class="muted">{{ s.notes }}</p> }
        <p class="muted">Check these values. The AI can be wrong about the plant or its needs.</p>
      </section>
    }
    @if (store.error(); as e) {
      <p class="error" role="alert">{{ e }}</p>
    }

    <form [formGroup]="form" (ngSubmit)="save()">
      <section class="card">
        <label class="field">
          <span>Plant</span>
          <input type="text" formControlName="plant" autocomplete="off" placeholder="For example Basil" />
        </label>
      </section>

      @for (m of measurements; track m.key) {
        <section class="card" [formGroup]="ranges.controls[m.key]">
          <h3>{{ m.label }}</h3>
          <div class="pair">
            <label class="field"><span>Minimum ({{ m.unit }})</span>
              <input type="number" inputmode="decimal" step="0.1" formControlName="min" />
            </label>
            <label class="field"><span>Maximum ({{ m.unit }})</span>
              <input type="number" inputmode="decimal" step="0.1" formControlName="max" />
            </label>
          </div>
          <p class="hint">Allowed {{ m.hardMin }} to {{ m.hardMax }} {{ m.unit }}. Leave both empty for no limit.</p>
          @if (ranges.controls[m.key].errors; as errs) {
            <p class="error" role="alert">{{ problem(m, errs) }}</p>
          }
        </section>
      }

      <div class="actions sticky">
        <button class="btn primary" type="submit" [disabled]="form.invalid || store.busy()">
          {{ store.busy() ? 'Saving…' : 'Save limits' }}
        </button>
        <a class="btn" routerLink="/">Cancel</a>
      </div>
    </form>
  `,
})
export class ReviewPage {
  protected readonly store = inject(LimitsStore);
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly measurements = MEASUREMENTS;
  protected readonly suggestion = this.store.suggestion();

  protected readonly ranges = new FormGroup<Record<string, RangeGroup>>({});
  protected readonly form = new FormGroup({
    plant: new FormControl(this.suggestion?.plant ?? this.store.profile()?.plant ?? '', { nonNullable: true }),
    ranges: this.ranges,
  });

  constructor() {
    const start = this.suggestion?.limits ?? this.store.profile()?.limits ?? {};
    for (const m of MEASUREMENTS) {
      const r = start[m.key];
      this.ranges.addControl(
        m.key,
        new FormGroup(
          { min: new FormControl<number | null>(r?.min ?? null), max: new FormControl<number | null>(r?.max ?? null) },
          { validators: [rangeGroupValidator(m)] },
        ),
      );
    }
  }

  protected problem(m: MeasurementMeta, errors: Record<string, unknown>): string {
    return problemText(m, errors);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) return;
    const profile: Profile = {
      device_id: this.session.device(),
      plant: this.form.controls.plant.value.trim(),
      source: this.suggestion ? 'ai' : 'manual',
      updated_at: null,
      limits: formToLimits(this.ranges.getRawValue() as RangeFormValue),
    };
    const saved = await this.store.save(profile);
    if (saved) {
      this.store.suggestion.set(null);
      await this.router.navigateByUrl('/');
    }
  }
}
