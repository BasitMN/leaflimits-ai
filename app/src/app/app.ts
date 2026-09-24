import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { isMockMode } from './limits-api';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="top">
      <h1>LeafLimits</h1>
      @if (mock) {
        <span class="badge">demo data</span>
      }
    </header>
    <main>
      <router-outlet />
    </main>
    <nav class="tabs" aria-label="Main">
      <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Current</a>
      <a routerLink="/capture" routerLinkActive="active">Photo</a>
      <a routerLink="/settings" routerLinkActive="active">Settings</a>
    </nav>
  `,
})
export class App {
  protected readonly mock = isMockMode();
}
