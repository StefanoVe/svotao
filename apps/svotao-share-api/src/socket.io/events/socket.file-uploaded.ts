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
    const userId = floorManager.getSocketHeaders(socket).agent.id;
    lm.log(
      `Socket with id ${userId} uploaded a file ` + JSON.stringify(data),
      'info',
    );

    const fmRoom = floorManager.getSocketRoom(socket);

    floorManager.editRoomSocketData(socket, {
      ...fmRoom.socketsData[userId],
      file: data,
    });

    io.in(fmRoom.room).emit(EnumSocketIOAppEvents.RoomUpdated, fmRoom);
  });
};
