import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { provideTablerIcons, TablerIconComponent } from 'angular-tabler-icons';
import {
  IconAdjustmentsAlt,
  IconChefHatFilled,
  IconHistory,
  IconSearch,
  IconStarFilled,
} from 'angular-tabler-icons/icons';
import { LiquidGlassContainer } from '../liquid-glass-container/liquid-glass-container';
@Component({
  selector: 'svotao-nav',
  imports: [
    CommonModule,
    LiquidGlassContainer,
    TablerIconComponent,
    RouterModule,
  ],
  templateUrl: './nav.html',
  styleUrl: './nav.css',
  providers: [
    provideTablerIcons({
      IconStarFilled,
      IconSearch,
      IconHistory,
      IconAdjustmentsAlt,
      IconChefHatFilled,
    }),
  ],
})
export class Nav {
  private _router = inject(Router);

  public items = [
    {
      path: '/history',
      icon: 'history',
    },
    {
      path: '/favorites',
      icon: 'star-filled',
    },
    {
      path: '/settings',
      icon: 'adjustments-alt',
    },
  ];

  public handleClick(item: { path: string }): void {
    this._router.navigate([item.path]);
  }

  public isActive(item: { path: string }): boolean {
    console.log(
      'Checking active state for:',
      item.path,
      this._router.isActive(item.path, {
        paths: 'exact',
        queryParams: 'exact',
        fragment: 'ignored',
        matrixParams: 'ignored',
      })
    );
    return this._router.isActive(item.path, {
      paths: 'exact',
      queryParams: 'exact',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
  }
}
