import { canSignal, validDescription } from './signaling';
import { EnumSocketIOAppEvents } from '@svotao/interfaces';
import { Server, Socket } from 'socket.io';
import { ContextualizedFloorManager } from '..';
export const socketAcceptFileOfferEvent = (
  io: Server,
  socket: Socket,
  floorManager: ContextualizedFloorManager,
) => {
  return socket.on(
    EnumSocketIOAppEvents.AcceptFileOffer,
    (data: { answer: RTCSessionDescriptionInit; to: string }) => {
      if (
        !canSignal(socket, floorManager, data?.to) ||
        !validDescription(data?.answer, 'answer')
      )
        return;
      io.to(data.to).emit(EnumSocketIOAppEvents.RTCAnswer, {
        answer: data.answer,
        from: floorManager.getSocketHeaders(socket).agent.id,
      });
    },
  );
};
