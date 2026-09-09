import { Router } from 'express';
import { Server } from 'socket.io';
import VechoBackend from 'vecholib/backend';
import { getHeartbeatRouter } from './routes/get.heartbeat';
import { getRtcConfigRouter } from './routes/get.rtc-config';
import { socketIoAppEvents } from './socket.io';

const port = 3000;
export const lm = VechoBackend.services.LogManager.init([], 100);

const routes = Router();
routes.use('/hb', getHeartbeatRouter);
routes.use('/rtc-config', getRtcConfigRouter);

const server = VechoBackend.bootstraps.initializeExpressApplication(routes);

// Socket.IO only carries signaling and metadata, never file payloads.
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 256 * 1024,
  perMessageDeflate: false,
  pingInterval: 25000,
  pingTimeout: 20000,
});
const floorManager = new VechoBackend.bootstraps.SocketioFloorManager(io);
io.on('connection', (socket) => socketIoAppEvents(io, socket, floorManager));

server.listen(port, () => {
  lm.log(`listening on port http://localhost:${port}`, 'info');
});
