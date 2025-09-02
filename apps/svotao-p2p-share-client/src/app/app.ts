import { AsyncPipe, CommonModule, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  PLATFORM_ID,
  ViewChild,
} from '@angular/core';
import { Router, RouterModule } from '@angular/router';

import { map, tap } from 'rxjs';
import {
  LiquidGlassContainer,
  UploadComponent,
} from 'vecholib/angular/components';
import { TailwindFormsModule, ToastrService } from 'vecholib/angular/modules';
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
    TailwindFormsModule,
    UploadComponent,
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
  private _platformId = inject(PLATFORM_ID);

  public roomUrl$ = this.socketio.socketData$.pipe(
    map((data) => `${environment.clientUrl}/s/rooms/${data.room}`),
    tap(),
  );

  public file: { file: File | null; blob: string | ArrayBuffer | null } = {
    file: null,
    blob: null,
  };

  constructor() {
    afterNextRender(() => {
      const room = this._getRoomId();

      this.socketio.connect(undefined, {
        room,
      });

      this.socketio.socketData$.subscribe((data) => {
        this._router.navigate(['s', 'rooms', data.room || '']);
      });
    });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this._platformId)) {
      return;
    }

    this.socketio.roomData$
      .pipe(
        tap(() => {
          setTimeout(() => {
            let angle = 360 - 90;
            const children = Array.from(
              this.circleGraph.nativeElement
                .children as HTMLCollectionOf<HTMLDivElement>,
            );
            const dangle = 360 / children.length;

            children.forEach((circle) => {
              angle += dangle;
              circle.style.transform = `rotate(${angle}deg) translate(${this.circleGraph.nativeElement.clientWidth / 2}px) rotate(-${angle}deg)`;
              circle.style.opacity = '100%';
              circle.classList.add('smooth');
            });
          }, 1000);
        }),
      )
      .subscribe();
  }

  public copyRoomUrl(url: string): void {
    navigator.clipboard.writeText(url).then(
      () => this._toastr.success('Room URL copied to clipboard!'),
      (err) => console.error('Failed to copy room URL:', err),
    );
  }

  public publishFile(event: (typeof this)['file']) {
    this.file = event;
    this.webrtc.publishedFile = this.file.file;
    this.socketio.publishFileData(this.file.file);
  }

  public requestFile(peer: string, fileName: string) {
    if (!fileName.length) {
      return;
    }

    this.socketio.requestFile(peer);
  }

  private _getRoomId() {
    const fragments = location.href.split('/');

    const roomId = fragments[fragments.length - 1];
    console.log(`Room ID: ${roomId}`);

    return roomId === 'new' ? undefined : roomId;
  }
}
