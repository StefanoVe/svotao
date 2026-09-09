import { canSignal } from './signaling';
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
      if (!canSignal(socket, floorManager, data?.peer)) return;
      const id = floorManager.getSocketHeaders(socket).agent.id;
      const room = floorManager.getSocketRoom(socket);
      const peerData = room?.socketsData[data.peer];

      if (
        !peerData?.file?.name?.length ||
        !Number.isSafeInteger(peerData.file.size) ||
        peerData.file.size < 0
      ) {
        socket.emit(EnumSocketIOAppEvents.TransferRejected, {
          from: data.peer,
        });
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
