import { inject, Injectable } from '@angular/core';
import { EnumSocketIOAppEvents, SocketioRoom } from '@svotao/interfaces';
import {
  BehaviorSubject,
  ReplaySubject,
  Subject,
  Subscription,
  tap,
} from 'rxjs';
import { io } from 'socket.io-client';
import { SocketConnectionHandlerService } from 'vecholib/angular/services';
import { IFloorManagerRoom } from 'vecholib/interfaces';
import { environment } from '../../environments/environment';
import { WebRTCService } from './webrtc.service';
export interface ISocketReadyData {
  room: string;
  userId: string;
  peers: number;
}

@Injectable({
  providedIn: 'root',
})
export class SocketService extends SocketConnectionHandlerService {
  private _webrtc = inject(WebRTCService);
  private _iceCandidateSubscription: Subscription | null = null;

  public socketData$ = new BehaviorSubject<ISocketReadyData>(
    <ISocketReadyData>{},
  );
  public roomData$ = new ReplaySubject<
    IFloorManagerRoom<{
      file: { name: string; size: number };
      backgroundColor: string;
    }>
  >(1);
  public rtcOffers$ = new Subject<{
    offer: RTCSessionDescriptionInit;
    from: string;
  }>();

  override connect<T>(userId?: string, headers?: T): void {
    console.log('Connecting to socket server');
    const agent = this._buildAgent(userId);
    const user = JSON.stringify(headers || {});
    const agentJson = JSON.stringify(agent);

    this.agent = agent;
    this.socket = io(environment.apiUrl, {
      secure: environment.apiUrl.startsWith('https://'),
      transports: ['polling', 'websocket'],
      auth: {
        user,
        agent: agentJson,
        id: agent.id,
      },
      query: {
        user,
        agent: agentJson,
        id: agent.id,
      },
    });

    this.socket.connect();

    this.socket.on('connect', () => {
      console.log('Connected to socket server');
      this.connection$.next({
        active: true,
        user: this.agent,
      });
    });

    this.socket.on('disconnect', () => {
      this.connection$.next({
        active: false,
      });
    });

    this.appEvents();
  }

  override appEvents(): void {
    // inoltra i candidati locali via socket al target impostato in WebRTCService
    this._iceCandidateSubscription?.unsubscribe();
    this._iceCandidateSubscription = this._webrtc.iceCandidates$.subscribe(
      (candidate) => {
        const to = this._webrtc.handshake?.to;
        if (!to) {
          console.warn(
            'Skipping ICE candidate forwarding because target peer is missing',
            candidate,
          );
          return;
        }

        console.log('Forwarding ICE candidate to:', to, candidate);
        setTimeout(() => {
          this.socket.emit(EnumSocketIOAppEvents.RTCIceCandidate, {
            candidate,
            to,
          });
        }, 100);
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.SocketReady,
      (data: ISocketReadyData) => {
        console.log('Socket ready data received:', data);
        this.socketData$.next(data);
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.RoomUpdated,
      (data: IFloorManagerRoom) => {
        console.log('Room updated data received:', data);
        this.socketData$
          .pipe(
            tap((sd) => {
              this.roomData$.next({
                ...data,
                sockets: data.sockets.filter((s) => s.id !== sd.userId),
              });
            }),
          )
          .subscribe();
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.RTCOffer,
      async (data: { offer: RTCSessionDescriptionInit; from: string }) => {
        console.log('RTC offer received:', data);
        this.rtcOffers$.next(data);
        const answer = await this._webrtc.receiveOffer(data.offer);

        this.socket.emit(EnumSocketIOAppEvents.AcceptFileOffer, {
          answer,
          to: data.from,
        });
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.RTCAnswer,
      async (data: { answer: RTCSessionDescriptionInit; from: string }) => {
        console.log('RTC answer received:', data);

        await this._webrtc.receiveAnswer(data.answer);
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.RequestFile,
      async (data: {
        target: string;
        file: SocketioRoom['socketData']['file'];
      }) => {
        await this._webrtc.openPeerConnection();
        this._webrtc.handshake = {
          to: data.target,
          from: this.socketData$.value.userId,
          direction: 'outbound',
        };
        console.log(
          `a peer requested a file from you:`,
          this._webrtc.handshake,
        );

        this._webrtc.createDataChannel({
          targetUser: data.target,
          fileName: data.file?.name || '',
          sourceUser: this.socketData$.value.userId,
          room: this.socketData$.value.room,
        });

        const offer = await this._webrtc.createOffer();

        this.socket.emit(EnumSocketIOAppEvents.AcceptFileRequest, {
          offer,
          to: data.target,
        });
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.AddRTCIceCandidate,
      async (data: { candidate: RTCIceCandidateInit; from: string }) => {
        console.log('RTC ICE candidate received:', data);
        await this._webrtc.addIceCandidate(data.candidate);
      },
    );
  }

  public publishFileData(file: File | null): void {
    console.log('Publishing file:', file);
    this.socket.emit(EnumSocketIOAppEvents.PublishFile, {
      name: file?.name,
      size: file?.size,
      type: file?.type,
    });
  }

  public async requestFile(peerId: string): Promise<void> {
    console.log('Requesting file from peer:', peerId);
    await this._webrtc.openPeerConnection();
    this._webrtc.handshake = {
      to: peerId,
      from: this.socketData$.value.userId,
      direction: 'inbound',
    };

    this.socket.emit(EnumSocketIOAppEvents.RequestFile, {
      peer: peerId,
    });
  }

  private _buildAgent(userId?: string) {
    return {
      browser: navigator.userAgent,
      device: navigator.platform || 'browser',
      deviceType: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
        ? 'mobile'
        : 'desktop',
      connectionTimestamp: Date.now(),
      id: userId || crypto.randomUUID(),
    };
  }
}
