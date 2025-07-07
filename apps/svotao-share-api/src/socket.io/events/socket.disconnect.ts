import VechoInterfaces from 'vecholib/interfaces';
import { lm } from '../../main';
export const socketDisconnectEvent = (io, socket, floorManager) => {
  return socket.on(VechoInterfaces.EnumSocketIOSystemEvents.Disconnect, () => {
    lm.log(`Socket disconnected with id ${socket.id}`, 'warning');
  });
};
