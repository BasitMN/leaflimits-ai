import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

import { authInterceptor } from './auth.interceptor';
import { HttpLimitsApi, LimitsApi, MockLimitsApi, isMockMode } from './limits-api';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Hash routing, so no server-side fallback route is needed when Node-RED serves the files.
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: LimitsApi, useFactory: () => (isMockMode() ? new MockLimitsApi() : new HttpLimitsApi()) },
  ],
};
