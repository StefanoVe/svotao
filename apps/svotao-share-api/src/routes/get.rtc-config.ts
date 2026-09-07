import { Router } from 'express';
import type { WebRTCConfig, WebRTCIceServerConfig } from '@svotao/interfaces';

const router = Router();

const parseList = (value?: string): string[] =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const buildIceServers = (): WebRTCIceServerConfig[] => {
  const iceServers: WebRTCIceServerConfig[] = [
    {
      urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
    },
  ];

  const turnUrls = parseList(process.env['TURN_URLS']);
  if (!turnUrls.length) {
    return iceServers;
  }

  const turnServer: WebRTCIceServerConfig = {
    urls: turnUrls,
  };

  const username = process.env['TURN_USERNAME'];
  const credential = process.env['TURN_CREDENTIAL'];

  if (username && credential) {
    turnServer.username = username;
    turnServer.credential = credential;
  }

  iceServers.push(turnServer);
  return iceServers;
};

router.get('/', async (_req, res) => {
  res.set('Cache-Control', 'no-store');

  const config: WebRTCConfig = {
    iceServers: buildIceServers(),
    iceTransportPolicy:
      process.env['RTC_FORCE_RELAY'] === 'true' ? 'relay' : 'all',
  };

  res.json(config);
});

export { router as getRtcConfigRouter };
