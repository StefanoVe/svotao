import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
} from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import {
  provideTailwindForms,
  provideTailwindToasts,
} from 'vecholib/angular/modules';
import { provideSocketConnectionHandlerService } from 'vecholib/angular/services';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';
export const appConfig: ApplicationConfig = {
  providers: [
    provideClientHydration(withEventReplay()),
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),
    provideTailwindForms({}),
    provideAnimations(),
    provideHttpClient(withFetch()),
    provideTailwindToasts(),
    provideSocketConnectionHandlerService({
      url: environment.apiUrl,
      secure: true,
    }),
  ],
};
