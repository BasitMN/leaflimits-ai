import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Session } from '../session';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule],
  template: `
    <form class="card" [formGroup]="form" (ngSubmit)="save()">
      <h2>Settings</h2>
      <label class="field"><span>Access token</span>
        <input type="password" formControlName="token" autocomplete="off" />
      </label>
      <p class="hint">The token is kept in this browser only and sent with every request.</p>
      <label class="field"><span>Device</span>
        <input type="text" formControlName="device" autocomplete="off" />
      </label>
      <p class="hint">Demo data without a server: open the app with <code>?mock=1</code> in the address (<code>?mock=0</code> turns it off).</p>
      <div class="actions"><button class="btn primary" type="submit">Save</button></div>
    </form>
  `,
})
export class SettingsPage {
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly form = new FormGroup({
    token: new FormControl(this.session.token(), { nonNullable: true }),
    device: new FormControl(this.session.device(), { nonNullable: true }),
  });

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    this.session.update(v.token, v.device);
    await this.router.navigateByUrl('/');
  }
}
