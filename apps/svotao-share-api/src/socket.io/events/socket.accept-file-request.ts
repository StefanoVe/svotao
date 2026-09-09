import { canSignal, validDescription } from './signaling';
import { EnumSocketIOAppEvents } from '@svotao/interfaces';
import { Server, Socket } from 'socket.io';
import { ContextualizedFloorManager } from '..';
export const socketAcceptFileRequestEvent = (
  io: Server,
  socket: Socket,
  floorManager: ContextualizedFloorManager,
) => {
  return socket.on(
    EnumSocketIOAppEvents.AcceptFileRequest,
    (data: { offer: RTCSessionDescriptionInit; to: string }) => {
      if (
        !canSignal(socket, floorManager, data?.to) ||
        !validDescription(data?.offer, 'offer')
      )
        return;
      io.to(data.to).emit(EnumSocketIOAppEvents.RTCOffer, {
        offer: data.offer,
        from: floorManager.getSocketHeaders(socket).agent.id,
      });
    },
  );
};
