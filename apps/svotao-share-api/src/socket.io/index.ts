import { EnumSocketIOAppEvents } from '@svotao/interfaces';
import { Server, Socket } from 'socket.io';
import { bootstraps } from 'vecholib/backend';
import { lm } from '../main';
import { socketDisconnectEvent } from './events/socket.disconnect';
import { socketFileUploadedEvent } from './events/socket.file-uploaded';
export const socketIoAppEvents = (
  io: Server,
  socket: Socket,
  floorManager: bootstraps.SocketioFloorManager,
) => {
  lm.log(`Socket connected with id ${socket.id}`, 'success');

  socketDisconnectEvent(io, socket, floorManager);
  socketFileUploadedEvent(io, socket, floorManager);

  const headers = floorManager.getSocketHeaders<{
    id: string;
    user: `{ room: string }`;
  }>(socket);
  const userId = headers.agent.id;

  const room =
    JSON.parse(headers.user).room ||
    Math.random().toString(36).substring(2, 15);

  floorManager.addSocketToRoom(socket, room);
  const roomData = floorManager.getRoom(room);

  lm.log(`Socket ${socket.id} added to room ${room}`, 'success');
  lm.log(
    `${roomData.sockets.length - 1} other sockets in room ${room}`,
    'info',
  );
  lm.log(`==================================`, 'end');

  socket.emit(EnumSocketIOAppEvents.SocketReady, {
    room,
    userId,
    peers: roomData.sockets.length - 1,
  });

  io.in(room).emit(EnumSocketIOAppEvents.RoomUpdated, {
    ...roomData,
    sockets: roomData.sockets,
  });
};
