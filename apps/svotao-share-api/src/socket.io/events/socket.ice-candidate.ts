import { EnumSocketIOAppEvents } from '@svotao/interfaces';
import { Server, Socket } from 'socket.io';
import { ContextualizedFloorManager } from '..';
export const socketForwardIceCandidate = (
  io: Server,
  socket: Socket,
  floorManager: ContextualizedFloorManager,
) => {
  return socket.on(
    EnumSocketIOAppEvents.RTCIceCandidate,
    (data: { candidate: RTCIceCandidateInit; to: string }) => {
      // Request the file from the peer
      socket.to(data.to).emit(EnumSocketIOAppEvents.AddRTCIceCandidate, {
        candidate: data.candidate,
        from: socket.id,
      });
    },
  );
};
