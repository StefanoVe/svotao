import { inject, Injectable } from '@angular/core';
import { EnumSocketIOAppEvents, SocketioRoom } from '@svotao/interfaces';
import { BehaviorSubject, ReplaySubject, Subject, Subscription } from 'rxjs';
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
    Omit<IFloorManagerRoom<SocketioRoom['socketData']>, 'socketsData'> & {
      socketsData: Record<string, SocketioRoom['socketData'] | undefined>;
    }
  >(1);
  public rtcOffers$ = new Subject<{
    offer: RTCSessionDescriptionInit;
    from: string;
  }>();

  override connect<T>(userId?: string, headers?: T): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }
    this._iceCandidateSubscription?.unsubscribe();
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
      this.connection$.next({ active: false });
      if (this._webrtc.busy && this._webrtc.channel?.readyState !== 'open') {
        this._webrtc.fail(new Error('Signaling disconnected. Please retry.'));
      }
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

        if (this.socket.connected)
          this.socket.emit(EnumSocketIOAppEvents.RTCIceCandidate, {
            candidate,
            to,
          });
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.SocketReady,
      (data: ISocketReadyData) => {
        console.log('Socket ready data received:', data);
        this.socketData$.next(data);
        const auth = this.socket.auth as Record<string, unknown>;
        auth['user'] = JSON.stringify({ room: data.room });
        this.socket.io.opts.query = {
          ...this.socket.io.opts.query,
          user: auth['user'] as string,
        };
        this.publishFileData(this._webrtc.publishedFile);
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.RoomUpdated,
      (data: IFloorManagerRoom) => {
        this.roomData$.next({
          ...data,
          sockets: data.sockets.filter(
            (s) => s.id !== this.socketData$.value.userId,
          ),
        });
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.RTCOffer,
      async (data: { offer: RTCSessionDescriptionInit; from: string }) => {
        await this._handleSignal(data.from, async () => {
          if (this._webrtc.handshake?.direction !== 'inbound') return;
          this.rtcOffers$.next(data);
          const answer = await this._webrtc.receiveOffer(data.offer);
          this.socket.emit(EnumSocketIOAppEvents.AcceptFileOffer, {
            answer,
            to: data.from,
          });
        });
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.RTCAnswer,
      async (data: { answer: RTCSessionDescriptionInit; from: string }) => {
        await this._handleSignal(data.from, () =>
          this._webrtc.receiveAnswer(data.answer),
        );
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.RequestFile,
      async (data: {
        target: string;
        file: SocketioRoom['socketData']['file'];
      }) => {
        if (this._webrtc.busy || !this._webrtc.publishedFile) {
          this.socket.emit(EnumSocketIOAppEvents.TransferRejected, {
            to: data.target,
          });
          return;
        }
        try {
          await this._webrtc.openPeerConnection({
            to: data.target,
            from: this.socketData$.value.userId,
            direction: 'outbound',
          });
          await this._handleSignal(data.target, async () => {
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
          });
        } catch (error) {
          this._webrtc.error$.next(
            error instanceof Error ? error.message : 'Unable to start transfer',
          );
        }
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.TransferRejected,
      (data: { from: string }) => {
        if (this._webrtc.handshake?.to === data.from)
          this._webrtc.fail(
            new Error('Peer is busy or the file is unavailable. Please retry.'),
          );
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.AddRTCIceCandidate,
      async (data: { candidate: RTCIceCandidateInit; from: string }) => {
        await this._handleSignal(data.from, () =>
          this._webrtc.addIceCandidate(data.candidate),
        );
      },
    );
  }

  private async _handleSignal(from: string, action: () => Promise<unknown>) {
    const handshake = this._webrtc.handshake;
    if (!handshake || handshake.to !== from) return;
    try {
      await action();
    } catch (error) {
      if (this._webrtc.handshake === handshake) this._webrtc.fail(error);
    }
  }

  override disconnect(): void {
    this._webrtc.close();
    this._iceCandidateSubscription?.unsubscribe();
    super.disconnect();
  }

  public publishFileData(file: File | null): void {
    this.socket.emit(EnumSocketIOAppEvents.PublishFile, {
      name: file?.name,
      size: file?.size,
      type: file?.type,
    });
  }

  public async requestFile(peerId: string): Promise<void> {
    if (!this.socket.connected)
      throw new Error('Not connected. Please wait for reconnection.');
    await this._webrtc.openPeerConnection({
      to: peerId,
      from: this.socketData$.value.userId,
      direction: 'inbound',
    });

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
