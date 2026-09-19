import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { downscaleToJpeg } from '../image';
import { LimitsStore } from '../limits-store';

@Component({
  selector: 'app-capture',
  imports: [RouterLink],
  template: `
    <section class="card">
      <h2>Take a photo of the plant</h2>
      <p class="muted">The photo is shrunk on your phone first and sent to the server, which asks an AI for recommended limits. You can change every value before anything is saved.</p>

      <input id="photo" class="visually-hidden" type="file" accept="image/*" capture="environment" (change)="onPick($event)" />
      <label for="photo" class="btn primary">{{ preview() ? 'Take another photo' : 'Open camera' }}</label>

      @if (preview(); as src) {
        <img class="preview" [src]="src" alt="Preview of the plant photo" />
      }
      @if (localError(); as e) {
        <p class="error" role="alert">{{ e }}</p>
      }
      @if (store.error(); as e) {
        <p class="error" role="alert">{{ e }}</p>
      }

      <div class="actions">
        <button class="btn primary" type="button" [disabled]="!preview() || store.busy()" (click)="analyze()">
          {{ store.busy() ? 'Asking the AI…' : 'Get suggested limits' }}
        </button>
        <a class="btn" routerLink="/review">Enter by hand</a>
      </div>
    </section>
  `,
})
export class CapturePage {
  protected readonly store = inject(LimitsStore);
  private readonly router = inject(Router);

  protected readonly preview = signal<string | null>(null);
  protected readonly localError = signal<string | null>(null);
  private image: string | null = null;

  protected async onPick(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.localError.set(null);
    try {
      const { base64, dataUrl } = await downscaleToJpeg(file);
      this.image = base64;
      this.preview.set(dataUrl);
    } catch {
      this.image = null;
      this.preview.set(null);
      this.localError.set('Could not read that photo. Try another one.');
    }
  }

  protected async analyze(): Promise<void> {
    if (!this.image) return;
    const suggestion = await this.store.analyze(this.image);
    if (suggestion) await this.router.navigateByUrl('/review');
  }
}
