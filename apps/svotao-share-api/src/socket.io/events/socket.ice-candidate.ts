import { canSignal } from './signaling';
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
      if (
        !canSignal(socket, floorManager, data?.to) ||
        typeof data?.candidate?.candidate !== 'string' ||
        data.candidate.candidate.length > 8192
      )
        return;
      socket.to(data.to).emit(EnumSocketIOAppEvents.AddRTCIceCandidate, {
        candidate: data.candidate,
        from: floorManager.getSocketHeaders(socket).agent.id,
      });
    },
  );
};
