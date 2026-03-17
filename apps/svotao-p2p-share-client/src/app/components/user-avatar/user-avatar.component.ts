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
  @Input() backgroundColor = '';

  public showUsersCards = false;

  public tailwindSize = '';
  public avatarSrc = '';
  public avatarFailed = false;
  private _avatarFallbackTried = false;
  private _avatarFormat: 'png' | 'svg' = 'png';

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this._updateTailwindSize();
    this._avatarFallbackTried = false;
    this._avatarFormat = 'png';
    this._setAvatarSrc(this._avatarFormat);
  }

  ngOnChanges(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this._updateTailwindSize();
    this._avatarFallbackTried = false;
    this._avatarFormat = 'png';
    this._setAvatarSrc(this._avatarFormat);
  }

  private _updateTailwindSize(): void {
    this.tailwindSize = `size-${this.size}`;
  }

  private _setAvatarSrc(format: 'png' | 'svg'): void {
    const seed = encodeURIComponent(this.user || 'guest');
    this.avatarSrc = `https://api.dicebear.com/9.x/big-smile/${format}?seed=${seed}`;
    this.avatarFailed = false;
  }

  public onAvatarError(): void {
    console.warn('Avatar load failed', {
      user: this.user,
      src: this.avatarSrc,
      attemptedFallback: this._avatarFallbackTried,
    });

    if (!this._avatarFallbackTried) {
      this._avatarFallbackTried = true;
      this._avatarFormat = this._avatarFormat === 'png' ? 'svg' : 'png';
      this._setAvatarSrc(this._avatarFormat);
      return;
    }

    this.avatarFailed = true;
  }

  public get avatarInitials(): string {
    return (this.user || '?').trim().slice(0, 2).toUpperCase();
  }
}
