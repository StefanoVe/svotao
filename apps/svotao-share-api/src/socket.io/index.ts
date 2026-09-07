import { EnumSocketIOAppEvents, SocketioRoom } from '@svotao/interfaces';
import { Server, Socket } from 'socket.io';
import { bootstraps, ISocketioFloorManager } from 'vecholib/backend';
import { generateColorFromSeed } from 'vecholib/functions';
import { lm } from '../main';
import { SOCKETIO_EVENTS } from './events';

export type ContextualizedFloorManager = ISocketioFloorManager<
  SocketioRoom['socketData']
>;

export const socketIoAppEvents = (
  io: Server,
  socket: Socket,
  floorManager: bootstraps.SocketioFloorManager,
) => {
  normalizeSocketHandshakeHeaders(socket);
  lm.log(`Socket connected with id ${socket.id}`, 'success');

  SOCKETIO_EVENTS.forEach((callback) => callback(io, socket, floorManager));

  const headers = floorManager.getSocketHeaders<{
    id: string;
    user: `{ room: string }`;
  }>(socket);
  const userId = headers.agent.id;

  //join socket to a self room
  socket.join(userId);

  const room =
    JSON.parse(headers.user).room ||
    Math.random().toString(36).substring(2, 15);

  //add socket to room of peers
  floorManager.addSocketToRoom(socket, room);

  //generate a background color for the socket's avatar
  floorManager.editRoomSocketData(socket, {
    backgroundColor: generateColorFromSeed(userId).toHex(true),
  });
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

const normalizeSocketHandshakeHeaders = (socket: Socket) => {
  const headerValue = (key: string): string | undefined => {
    const authValue = socket.handshake.auth?.[key];
    const queryValue = socket.handshake.query?.[key];
    const value = authValue || queryValue;

    if (Array.isArray(value)) {
      return value[0];
    }

    return typeof value === 'string' ? value : undefined;
  };

  socket.handshake.headers.user =
    socket.handshake.headers.user || headerValue('user') || '{}';
  socket.handshake.headers.agent =
    socket.handshake.headers.agent || headerValue('agent') || '{}';
  socket.handshake.headers.id =
    socket.handshake.headers.id || headerValue('id') || '';
};
