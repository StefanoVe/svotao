import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 's/rooms/:room',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return [];
    },
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
