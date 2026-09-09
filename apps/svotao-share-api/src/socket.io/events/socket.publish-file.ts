import { EnumSocketIOAppEvents, SocketioRoom } from '@svotao/interfaces';
import { Server, Socket } from 'socket.io';
import { ISocketioFloorManager } from 'vecholib/interfaces';
import { lm } from '../../main';
export const socketPublishFileEvent = (
  io: Server,
  socket: Socket,
  floorManager: ISocketioFloorManager,
) => {
  return socket.on(
    EnumSocketIOAppEvents.PublishFile,
    (data: SocketioRoom['socketData']['file']) => {
      const file = data?.name == null ? undefined : data;
      if (
        file &&
        (typeof file.name !== 'string' ||
          !file.name.length ||
          file.name.length > 4096 ||
          !Number.isSafeInteger(file.size) ||
          file.size < 0 ||
          typeof file.type !== 'string' ||
          file.type.length > 256)
      )
        return;
      const userId = floorManager.getSocketHeaders(socket).agent.id;
      lm.log(
        `Socket with id ${userId} uploaded a file ` + JSON.stringify(data),
        'info',
      );

      const fmRoom = floorManager.getSocketRoom(socket);

      if (!fmRoom) return;
      floorManager.editRoomSocketData(socket, {
        ...fmRoom.socketsData[userId],
        file: file
          ? { name: file.name, size: file.size, type: file.type }
          : undefined,
      });

      io.in(fmRoom.room).emit(EnumSocketIOAppEvents.RoomUpdated, fmRoom);
    },
  );
};
