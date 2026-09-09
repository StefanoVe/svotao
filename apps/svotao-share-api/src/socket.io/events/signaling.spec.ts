import { EnumSocketIOAppEvents as Events } from '@svotao/interfaces';
import type { Server, Socket } from 'socket.io';
import type { ContextualizedFloorManager } from '..';
import { socketRequestFileEvent } from './socket.request-file';
import { socketAcceptFileRequestEvent } from './socket.accept-file-request';
import { socketAcceptFileOfferEvent } from './socket.accept-file-offer';
import { socketForwardIceCandidate } from './socket.ice-candidate';
import { socketTransferRejectedEvent } from './socket.transfer-rejected';

describe('room signaling', () => {
  let handlers: Record<string, (data: unknown) => void>;
  let emit: jest.Mock;
  let to: jest.Mock;
  beforeEach(() => {
    handlers = {};
    emit = jest.fn();
    to = jest.fn(() => ({ emit }));
    const socket = {
      id: 'transport-id',
      on: (event: string, handler: (data: unknown) => void) => {
        handlers[event] = handler;
      },
      to,
      emit,
    } as unknown as Socket;
    const manager = {
      getSocketHeaders: () => ({ agent: { id: 'user-id' } }),
      getSocketRoom: () => ({
        room: 'test',
        socketsData: {
          receiver: { file: { name: 'empty', size: 0, type: '' } },
          unavailable: {},
        },
      }),
    } as unknown as ContextualizedFloorManager;
    const io = { to } as unknown as Server;
    [
      socketRequestFileEvent,
      socketAcceptFileRequestEvent,
      socketAcceptFileOfferEvent,
      socketForwardIceCandidate,
      socketTransferRejectedEvent,
    ].forEach((register) => register(io, socket, manager));
  });
  it('requests empty files', () => {
    handlers[Events.RequestFile]({ peer: 'receiver' });
    expect(emit).toHaveBeenCalledWith(
      Events.RequestFile,
      expect.objectContaining({
        target: 'user-id',
        file: expect.objectContaining({ size: 0 }),
      }),
    );
  });
  it('reports unavailable files', () => {
    handlers[Events.RequestFile]({ peer: 'unavailable' });
    expect(emit).toHaveBeenCalledWith(Events.TransferRejected, {
      from: 'unavailable',
    });
  });
  it('uses the same user ID for offers, answers and ICE', () => {
    handlers[Events.AcceptFileRequest]({
      to: 'receiver',
      offer: { type: 'offer', sdp: 'valid' },
    });
    handlers[Events.AcceptFileOffer]({
      to: 'receiver',
      answer: { type: 'answer', sdp: 'valid' },
    });
    handlers[Events.RTCIceCandidate]({
      to: 'receiver',
      candidate: { candidate: 'candidate:test' },
    });
    expect(emit).toHaveBeenCalledTimes(3);
    for (const call of emit.mock.calls) expect(call[1].from).toBe('user-id');
  });
  it('rejects missing, foreign, inherited and self destinations without throwing', () => {
    for (const peer of [
      undefined,
      'foreign',
      '__proto__',
      'constructor',
      'user-id',
    ]) {
      handlers[Events.RequestFile]({ peer });
      handlers[Events.AcceptFileRequest]({
        to: peer,
        offer: { type: 'offer', sdp: 'valid' },
      });
      handlers[Events.RTCIceCandidate]({
        to: peer,
        candidate: { candidate: 'candidate:test' },
      });
    }
    for (const handler of Object.values(handlers))
      expect(() => handler(null)).not.toThrow();
    expect(emit).not.toHaveBeenCalled();
  });
  it('rejects invalid descriptions and ICE candidates', () => {
    handlers[Events.AcceptFileRequest]({
      to: 'receiver',
      offer: { type: 'answer', sdp: 'valid' },
    });
    handlers[Events.AcceptFileOffer]({
      to: 'receiver',
      answer: { type: 'answer', sdp: 'x'.repeat(128 * 1024 + 1) },
    });
    handlers[Events.RTCIceCandidate]({ to: 'receiver', candidate: {} });
    expect(emit).not.toHaveBeenCalled();
  });
});
