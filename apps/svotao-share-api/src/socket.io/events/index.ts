import { socketAcceptFileOfferEvent } from './socket.accept-file-offer';
import { socketAcceptFileRequestEvent } from './socket.accept-file-request';
import { socketDisconnectEvent } from './socket.disconnect';
import { socketPublishFileEvent } from './socket.publish-file';
import { socketRequestFileEvent } from './socket.request-file';

export const SOCKETIO_EVENTS = [
  socketDisconnectEvent,
  socketRequestFileEvent,
  socketPublishFileEvent,
  socketAcceptFileRequestEvent,
  socketAcceptFileOfferEvent,
];
