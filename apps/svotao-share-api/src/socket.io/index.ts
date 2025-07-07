import { Server, Socket } from 'socket.io';
import { bootstraps } from 'vecholib/backend';
import { lm } from '../main';
import { socketDisconnectEvent } from './events/socket.disconnect';
export const socketIoAppEvents = (
  io: Server,
  socket: Socket,
  floorManager: bootstraps.SocketioFloorManager,
) => {
  lm.log(`Socket connected with id ${socket.id}`, 'success');

  socketDisconnectEvent(io, socket, floorManager);

  // Add more event listeners as needed
};
