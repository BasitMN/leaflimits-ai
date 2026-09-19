import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { looksLikeApiKey } from './secrets';
import { Session } from './session';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(Session).token();
  // Last line of defence: never send something that looks like an API key.
  return next(token && !looksLikeApiKey(token) ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};
