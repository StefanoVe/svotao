import { EnumSocketIOAppEvents } from '@svotao/interfaces';
import { Server } from 'socket.io';
import VechoInterfaces, { ISocketioFloorManager } from 'vecholib/interfaces';
import { lm } from '../../main';
export const socketDisconnectEvent = (
  io: Server,
  socket,
  floorManager: ISocketioFloorManager,
) => {
  return socket.on(VechoInterfaces.EnumSocketIOSystemEvents.Disconnect, () => {
    const id = floorManager.getSocketHeaders(socket).agent.id;
    lm.log(`Socket disconnected with id ${id}`, 'warning');

    const fmRoom = floorManager.removeSocketFromRoom(socket);

    floorManager.editRoomSocketData(socket, {});

    io.in(fmRoom.room).emit(
      EnumSocketIOAppEvents.RoomUpdated,
      floorManager.getRoom(fmRoom.room),
    );
  });
};
