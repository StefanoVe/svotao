import { EnumSocketIOAppEvents } from '@svotao/interfaces';
import { Server, Socket } from 'socket.io';
import { ContextualizedFloorManager } from '..';
export const socketRequestFileEvent = (
  io: Server,
  socket: Socket,
  floorManager: ContextualizedFloorManager,
) => {
  return socket.on(
    EnumSocketIOAppEvents.RequestFile,
    (data: { peer: string }) => {
      const id = floorManager.getSocketHeaders(socket).agent.id;
      const room = floorManager.getSocketRoom(socket);
      const peerData = room.socketsData[data.peer];

      if (!peerData.file?.name.length || !peerData.file?.size) {
        return;
      }

      // Request the file from the peer
      socket.to(data.peer).emit(EnumSocketIOAppEvents.RequestFile, {
        target: id,
        file: peerData.file,
      });
    },
  );
};
