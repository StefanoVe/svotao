import { inject, Injectable } from '@angular/core';
import { EnumSocketIOAppEvents, SocketioRoom } from '@svotao/interfaces';
import { BehaviorSubject, ReplaySubject, Subject, tap } from 'rxjs';
import { SocketConnectionHandlerService } from 'vecholib/angular/services';
import { IFloorManagerRoom } from 'vecholib/interfaces';
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

  override appEvents(): void {
    // inoltra i candidati locali via socket al target impostato in WebRTCService
    this._webrtc.iceCandidates$.subscribe((candidate) => {
      const to = this._webrtc.targetUser;
      if (!to) {
        return;
      }
      this.socket.emit(EnumSocketIOAppEvents.RTCIceCandidate, {
        candidate,
        to,
      });
    });

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

        //TODO fixare web rtc, passsa offer e answer ma la connessione non viene sstabilita
        await this._webrtc.receiveAnswer(data.answer);

        console.log(
          'connection',
          this._webrtc.peer.connectionState === 'connected',
        );
      },
    );

    this.socket.on(
      EnumSocketIOAppEvents.RequestFile,
      async (data: {
        target: string;
        file: SocketioRoom['socketData']['file'];
      }) => {
        console.log(`a peer requested a file from you:`, data);
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

  public requestFile(peerId: string): void {
    console.log('Requesting file from peer:', peerId);
    this.socket.emit(EnumSocketIOAppEvents.RequestFile, {
      peer: peerId,
    });
  }
}
