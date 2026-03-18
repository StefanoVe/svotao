import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    redirectTo: 's/rooms/new',
    pathMatch: 'full',
  },
  {
    path: 's/rooms/:room',
    loadComponent: () => import('./app').then((m) => m.App),
    title: 'Vecho Share',
  },
  // {
  //   path: '**',
  //   redirectTo: 's/rooms/new',
  // },
];
