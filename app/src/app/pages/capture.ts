import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { checkImageFile, decodeErrorMessage, downscaleToJpeg } from '../image';
import { LimitsStore } from '../limits-store';

@Component({
  selector: 'app-capture',
  imports: [RouterLink],
  template: `
    <section
      class="card"
      [class.dragging]="dragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
    >
      <h2>Add a photo of the plant</h2>
      <p class="muted">
        Take a new photo or choose one you already have. The photo is shrunk on your phone first and sent to the
        server, which asks an AI for recommended limits. You can change every value before anything is saved.
      </p>

      <div class="actions">
        <label class="btn primary">
          <input class="visually-hidden" type="file" accept="image/*" capture="environment" (change)="onPick($event)" />
          Take a photo
        </label>
        <label class="btn">
          <input class="visually-hidden" type="file" accept="image/*" (change)="onPick($event)" />
          Choose from gallery
        </label>
      </div>
      <p class="hint">On a computer you can also drop an image here.</p>

      @if (preview(); as src) {
        <img class="preview" [src]="src" alt="Preview of the plant photo" />
        <p class="hint">{{ caption() }}</p>
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
  protected readonly caption = signal('');
  protected readonly localError = signal<string | null>(null);
  protected readonly dragging = signal(false);
  private image: string | null = null;

  protected async onPick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // choosing the same file again must fire "change" again
    if (file) await this.useFile(file);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) await this.useFile(file);
  }

  private async useFile(file: File): Promise<void> {
    this.localError.set(null);
    this.store.error.set(null);
    const problem = checkImageFile(file);
    if (problem) {
      this.clear();
      this.localError.set(problem);
      return;
    }
    try {
      const { base64, dataUrl } = await downscaleToJpeg(file);
      this.image = base64;
      this.preview.set(dataUrl);
      this.caption.set(`${file.name || 'Photo'} · sent as about ${Math.round((base64.length * 3) / 4 / 1024)} KB`);
    } catch {
      this.clear();
      this.localError.set(decodeErrorMessage(file));
    }
  }

  private clear(): void {
    this.image = null;
    this.preview.set(null);
    this.caption.set('');
  }

  protected async analyze(): Promise<void> {
    if (!this.image) return;
    const suggestion = await this.store.analyze(this.image);
    if (suggestion) await this.router.navigateByUrl('/review');
  }
}
