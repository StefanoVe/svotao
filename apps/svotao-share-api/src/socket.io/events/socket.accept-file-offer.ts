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
      console.log('Accepting file offer:', data);
      io.to(data.to).emit(EnumSocketIOAppEvents.RTCAnswer, {
        answer: data.answer,
        from: socket.id,
      });
    },
  );
};
