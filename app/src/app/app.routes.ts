import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', title: 'LeafLimits', loadComponent: () => import('./pages/current').then((m) => m.CurrentPage) },
  { path: 'capture', title: 'Take a photo', loadComponent: () => import('./pages/capture').then((m) => m.CapturePage) },
  { path: 'review', title: 'Review limits', loadComponent: () => import('./pages/review').then((m) => m.ReviewPage) },
  { path: 'settings', title: 'Settings', loadComponent: () => import('./pages/settings').then((m) => m.SettingsPage) },
  { path: '**', redirectTo: '' },
];
