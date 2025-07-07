import { Router } from 'express';
import VechoBackend from 'vecholib/backend';
import { getHeartbeatRouter } from './routes/get.heartbeat';
import { socketIoAppEvents } from './socket.io';

const port = 3000;
export const lm = VechoBackend.services.LogManager.init([], 100);

const routes = Router();
routes.use('/hb', getHeartbeatRouter);

const server = VechoBackend.bootstraps.initializeExpressApplication(routes);

const socket = VechoBackend.bootstraps.initializeSocketio(
  server,
  socketIoAppEvents,
);

server.listen(port, () => {
  lm.log(`listening on port http://localhost:${port}`, 'info');
});

socket.listen(() => lm.log('Socket.IO server is listening', 'info'));
