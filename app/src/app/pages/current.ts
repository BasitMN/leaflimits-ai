import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { timer } from 'rxjs';
import { isMockMode } from '../limits-api';
import { LimitsStore } from '../limits-store';
import { LimitState, MEASUREMENTS } from '../models';
import { Session } from '../session';

const STATE_TEXT: Record<LimitState, string> = {
  ok: 'In range',
  low: 'Too low',
  high: 'Too high',
  unknown: 'No limit set',
};

@Component({
  selector: 'app-current',
  imports: [RouterLink, DatePipe, DecimalPipe],
  template: `
    @if (tokenMissing()) {
      <p class="notice">No access token yet. <a routerLink="/settings">Open Settings</a> to enter it.</p>
    }
    @if (store.error(); as e) {
      <p class="error" role="alert">{{ e }}</p>
    }

    <section class="card">
      @if (store.profile(); as p) {
        <h2>{{ p.plant || 'No plant set' }}</h2>
        <p class="muted">
          @switch (p.source) {
            @case ('ai') { Limits suggested by AI and confirmed by you }
            @case ('manual') { Limits set by hand }
            @default { No limits saved yet }
          }
          @if (p.updated_at) { · updated {{ p.updated_at | date: 'medium' }} }
        </p>
      } @else {
        <p class="muted">Loading profile…</p>
      }
      <div class="actions">
        <a class="btn primary" routerLink="/capture">Take a photo</a>
        <a class="btn" routerLink="/review">Edit by hand</a>
      </div>
    </section>

    @for (r of rows(); track r.meta.key) {
      <section class="card sensor" [attr.data-state]="r.state">
        <div>
          <h3>{{ r.meta.label }}</h3>
          <p class="muted">
            @if (r.range) { Limit {{ r.range.min }} to {{ r.range.max }} {{ r.meta.unit }} } @else { No limit set }
          </p>
        </div>
        <div class="reading">
          @if (r.live) {
            <strong>{{ r.live.value | number: '1.1-1' }} <small>{{ r.meta.unit }}</small></strong>
          } @else {
            <strong>–</strong>
          }
          <span class="chip" [attr.data-state]="r.state">{{ r.stateText }}</span>
        </div>
      </section>
    }
  `,
})
export class CurrentPage {
  protected readonly store = inject(LimitsStore);
  private readonly session = inject(Session);

  protected readonly tokenMissing = computed(() => !this.session.token() && !isMockMode());

  protected readonly rows = computed(() =>
    MEASUREMENTS.map((meta) => {
      const live = this.store.status()[meta.key] ?? null;
      const state: LimitState = live?.state ?? 'unknown';
      const range = this.store.profile()?.limits[meta.key] ?? null;
      // Right after saving, a limit exists but the server has not classified a reading against it yet.
      const stateText = state === 'unknown' && range ? 'Waiting for a reading' : STATE_TEXT[state];
      return { meta, live, state, stateText, range };
    }),
  );

  constructor() {
    // A stale suggestion must not leak into "Edit by hand".
    this.store.suggestion.set(null);
    void this.store.loadProfile();
    timer(0, 5000).pipe(takeUntilDestroyed()).subscribe(() => void this.store.refreshStatus());
  }
}
