import type { Socket } from 'socket.io';
import type { ContextualizedFloorManager } from '..';

export function canSignal(
  socket: Socket,
  manager: ContextualizedFloorManager,
  to: unknown,
): to is string {
  if (typeof to !== 'string' || !to || to.length > 256) return false;
  const room = manager.getSocketRoom(socket);
  const from = manager.getSocketHeaders(socket).agent.id;
  return (
    to !== from &&
    !!room &&
    Object.prototype.hasOwnProperty.call(room.socketsData, to)
  );
}

export function validDescription(
  value: RTCSessionDescriptionInit,
  type: 'offer' | 'answer',
): boolean {
  return (
    value?.type === type &&
    typeof value.sdp === 'string' &&
    value.sdp.length > 0 &&
    value.sdp.length <= 128 * 1024
  );
}
