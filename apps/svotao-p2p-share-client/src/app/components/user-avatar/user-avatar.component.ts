import { CommonModule, isPlatformBrowser, SlicePipe } from '@angular/common';
import {
  Component,
  inject,
  Input,
  OnChanges,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { LiquidGlassContainer } from 'vecholib/angular/components';

@Component({
  selector: 'svotao-p2p-share-user-avatar',
  standalone: true,
  imports: [CommonModule, SlicePipe, LiquidGlassContainer],
  templateUrl: './user-avatar.component.html',
  styleUrls: ['./user-avatar.component.scss'],
})
export class UserAvatarComponent implements OnInit, OnChanges {
  private platformId = inject(PLATFORM_ID);
  @Input() user = 'Ignoto';
  @Input() userSubtext = '';
  @Input() showName = true;
  @Input() selected = false;
  @Input() size:
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 12
    | 14
    | 16
    | 18
    | 24
    | 28
    | 32
    | 36
    | 42 = 10;
  @Input() textSize = 'md';
  @Input() useRandomBackground = false;

  public showUsersCards = false;

  public tailwindSize = '';
  public backgroundColor = '#000000';

  ngOnInit(): void {
    this.backgroundColor = this._generateBackgroundColor();
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this._updateTailwindSize();
  }

  ngOnChanges(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this._updateTailwindSize();
  }

  private _updateTailwindSize(): void {
    this.tailwindSize = `size-${this.size}`;
  }
  private _generateBackgroundColor(): string {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }
}
