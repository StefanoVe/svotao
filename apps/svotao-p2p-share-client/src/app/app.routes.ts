import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: 's/rooms/:room',
    loadComponent: () => import('./app').then((m) => m.App),
    title: 'P2P Share Client',
  },
  {
    path: '**',
    redirectTo: 's/rooms/new',
  },
];
