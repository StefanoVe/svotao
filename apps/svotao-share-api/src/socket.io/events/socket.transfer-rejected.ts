import { EnumSocketIOAppEvents } from '@svotao/interfaces';
import { Server, Socket } from 'socket.io';
import type { ContextualizedFloorManager } from '..';
import { canSignal } from './signaling';

export const socketTransferRejectedEvent = (
  io: Server,
  socket: Socket,
  manager: ContextualizedFloorManager,
) => {
  socket.on(EnumSocketIOAppEvents.TransferRejected, (data: { to: string }) => {
    if (!canSignal(socket, manager, data?.to)) return;
    io.to(data.to).emit(EnumSocketIOAppEvents.TransferRejected, {
      from: manager.getSocketHeaders(socket).agent.id,
    });
  });
};
