import { Injectable } from '@angular/core';
import { EnumSocketIOAppEvents } from '@svotao/interfaces';
import { ReplaySubject, tap } from 'rxjs';
import { SocketConnectionHandlerService } from 'vecholib/angular/services';
import { IFloorManagerRoom } from 'vecholib/interfaces';
export interface ISocketReadyData {
  room: string;
  userId: string;
  peers: number;
}

@Injectable({
  providedIn: 'root',
})
export class SocketService extends SocketConnectionHandlerService {
  public socketData$ = new ReplaySubject<ISocketReadyData>(1);
  public roomData$ = new ReplaySubject<
    IFloorManagerRoom<{
      file: { name: string; size: number };
      backgroundColor: string;
    }>
  >(1);
  override appEvents(): void {
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
  }

  public uploadFile(file: File | null): void {
    console.log('Uploading file:', file);
    this.socket.emit(EnumSocketIOAppEvents.FileUploaded, {
      name: file?.name,
      size: file?.size,
      type: file?.type,
    });
  }
}
