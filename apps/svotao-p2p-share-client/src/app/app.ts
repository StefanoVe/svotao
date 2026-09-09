import { AsyncPipe, CommonModule, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  HostListener,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterModule } from '@angular/router';

import { debounceTime, map, tap } from 'rxjs';
import { LiquidGlassContainer } from 'vecholib/angular/components';
import { ToastrService } from 'vecholib/angular/modules';
import { environment } from '../environments/environment';
import { ProgressComponent } from './components/progress/progress.component';
import { UserAvatarComponent } from './components/user-avatar/user-avatar.component';
import { FileSizePipe } from './pipes/filesize.pipe';
import { SocketService } from './services/socket.service';
import { WebRTCService } from './services/webrtc.service';
@Component({
  imports: [
    RouterModule,
    LiquidGlassContainer,
    AsyncPipe,
    CommonModule,
    UserAvatarComponent,
    FileSizePipe,
    ProgressComponent,
  ],
  selector: 'svotao-p2p-share-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit {
  @ViewChild('CircleGraph') circleGraph!: ElementRef<HTMLDivElement>;
  public socketio = inject(SocketService);
  public webrtc = inject(WebRTCService);
  private _toastr = inject(ToastrService);
  private _router = inject(Router);
  private _destroyRef = inject(DestroyRef);
  private _platformId = inject(PLATFORM_ID);

  public roomUrl$ = this.socketio.socketData$.pipe(
    map((data) => `${environment.clientUrl}/s/rooms/${data.room}`),
  );

  public file: { file: File | null; blob: string | ArrayBuffer | null } = {
    file: null,
    blob: null,
  };

  constructor() {
    this.webrtc.error$
      .pipe(takeUntilDestroyed())
      .subscribe((message) => this._toastr.error(message));
    this.socketio.socketData$.pipe(takeUntilDestroyed()).subscribe((data) => {
      if (data.room) void this._router.navigate(['s', 'rooms', data.room]);
    });
    this._destroyRef.onDestroy(() => this.socketio.disconnect());
    afterNextRender(() => {
      this._bootstrap();
    });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this._platformId)) {
      return;
    }

    this.socketio.roomData$
      .pipe(
        debounceTime(1000),
        takeUntilDestroyed(this._destroyRef),
        tap(() => {
          this.layoutPeers();
        }),
      )
      .subscribe();
  }

  @HostListener('window:resize')
  public layoutPeers(): void {
    const graph = this.circleGraph?.nativeElement;
    if (!graph || !graph.children.length) return;
    const radius = graph.clientWidth / 2;
    const step = 360 / graph.children.length;
    Array.from(graph.children).forEach((child, index) => {
      const angle = 270 + step * (index + 1);
      const circle = child as HTMLElement;
      circle.style.transform = `rotate(${angle}deg) translate(${radius}px) rotate(${-angle}deg)`;
      circle.style.opacity = '1';
      circle.classList.add('smooth');
    });
  }

  public async changeRoom() {
    if (this.webrtc.busy) {
      this._toastr.error('Wait for the current transfer to finish.');
      return;
    }
    const roomName = prompt('Room name:')?.trim();
    if (!roomName) return;
    if (await this._router.navigate(['s', 'rooms', roomName])) {
      this.socketio.disconnect();
      this._bootstrap();
    }
  }

  public copyRoomUrl(url: string): void {
    navigator.clipboard.writeText(url).then(
      () => this._toastr.success('Room URL copied to clipboard!'),
      (err) => console.error('Failed to copy room URL:', err),
    );
  }

  public publishFile(event: (typeof this)['file']) {
    if (this.webrtc.busy) {
      this._toastr.error('Wait for the current transfer to finish.');
      return;
    }
    this.file = event;
    this.webrtc.publishedFile = this.file.file;
    this.socketio.publishFileData(this.file.file);
  }

  public onNativeFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] || null;
    if (!file) {
      return;
    }
    this.publishFile({
      file,
      blob: null,
    });
    // Permette di riselezionare lo stesso file al tentativo successivo.
    input.value = '';
  }

  public onFileDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  public onFileDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0] || null;
    if (!file) {
      return;
    }
    this.publishFile({
      file,
      blob: null,
    });
  }

  public requestFile(peer: string, fileName: string) {
    if (!fileName.length) {
      return;
    }

    void this.socketio
      .requestFile(peer)
      .catch((error) =>
        this._toastr.error(
          error instanceof Error ? error.message : 'Unable to request file',
        ),
      );
  }

  private _getRoomId() {
    const fragments = location.pathname.split('/');

    const roomId = fragments[fragments.length - 1];
    console.log(`Room ID: ${roomId}`);

    return roomId === 'new' ? undefined : decodeURIComponent(roomId);
  }

  private _bootstrap() {
    const room = this._getRoomId();

    this.socketio.connect(undefined, {
      room,
    });
    void this.webrtc.preloadRTCConfiguration();
  }
}
