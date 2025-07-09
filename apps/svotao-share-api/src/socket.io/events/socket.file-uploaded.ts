import { EnumSocketIOAppEvents } from '@svotao/interfaces';
import { Server, Socket } from 'socket.io';
import { ISocketioFloorManager } from 'vecholib/interfaces';
import { lm } from '../../main';
export const socketFileUploadedEvent = (
  io: Server,
  socket: Socket,
  floorManager: ISocketioFloorManager,
) => {
  return socket.on(EnumSocketIOAppEvents.FileUploaded, (data: string) => {
    const id = floorManager.getSocketHeaders(socket).agent.id;
    lm.log(
      `Socket with id ${id} uploaded a file ` + JSON.stringify(data),
      'info',
    );

    floorManager.editRoomSocketData(socket, { file: data });

    const fmRoom = floorManager.getSocketRoom(socket);
    io.in(fmRoom.room).emit(EnumSocketIOAppEvents.RoomUpdated, fmRoom);
  });
};
