import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { WebRTCService } from './webrtc.service';

class Channel extends EventTarget {
  readyState = 'open';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  binaryType = 'blob';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sent: (string | Uint8Array)[] = [];
  send = jest.fn((data: string | Uint8Array) => {
    this.sent.push(data);
  });
  close = jest.fn(() => {
    this.readyState = 'closed';
    this.dispatchEvent(new Event('close'));
  });
  message(data: unknown) {
    this.onmessage?.({ data });
  }
}
class Peer {
  static instances: Peer[] = [];
  channel = new Channel();
  sctp = { maxMessageSize: 16 * 1024 };
  close = jest.fn();
  createDataChannel = () => this.channel;
  constructor() {
    Peer.instances.push(this);
  }
}
const handshake = {
  to: 'receiver',
  from: 'sender',
  direction: 'outbound' as const,
};
function file(size: number): File {
  const bytes = new Uint8Array(size).map((_, i) => i % 251);
  return {
    name: 'test.bin',
    size,
    type: 'application/octet-stream',
    slice: (start: number, end: number) => ({
      arrayBuffer: async () => bytes.slice(start, end).buffer,
    }),
  } as File;
}
async function settle() {
  for (let i = 0; i < 100; i++) await Promise.resolve();
}

describe('WebRTC transfers', () => {
  let service: WebRTCService;
  let channel: Channel;
  let errors: string[];
  beforeEach(async () => {
    jest.useFakeTimers();
    Object.defineProperty(globalThis, 'RTCPeerConnection', {
      configurable: true,
      value: Peer,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:test'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
    });
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: HttpClient,
          useValue: { get: () => of({ iceServers: [] }) },
        },
      ],
    });
    service = TestBed.inject(WebRTCService);
    errors = [];
    service.error$.subscribe((error) => errors.push(error));
    await service.openPeerConnection(handshake);
    service.createDataChannel({
      sourceUser: 'sender',
      targetUser: 'receiver',
      fileName: 'test.bin',
      room: 'test',
    });
    channel = Peer.instances[Peer.instances.length - 1].channel;
  });
  afterEach(() => {
    service.close();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('respects negotiated message size, preserves bytes, and waits for receiver confirmation', async () => {
    const transfer = service.sendFile(file(100000));
    await settle();
    const chunks = channel.sent.filter(
      (data): data is Uint8Array => data instanceof Uint8Array,
    );
    expect(chunks.every((chunk) => chunk.byteLength <= 16384)).toBe(true);
    expect(chunks.reduce((size, chunk) => size + chunk.byteLength, 0)).toBe(
      100000,
    );
    expect(Array.from(chunks.flatMap((chunk) => Array.from(chunk)))).toEqual(
      Array.from(new Uint8Array(100000).map((_, i) => i % 251)),
    );
    expect(service.busy).toBe(true);
    expect(service.progress$.value?.percentage).toBeLessThan(100);
    channel.message(JSON.stringify({ type: 'ack', size: 100000 }));
    await transfer;
    expect(service.progress$.value?.percentage).toBe(100);
    expect(service.busy).toBe(false);
    expect(channel.close).toHaveBeenCalled();
  });

  it('supports empty files with explicit completion', async () => {
    const transfer = service.sendFile(file(0));
    channel.message(JSON.stringify({ type: 'ack', size: 0 }));
    await transfer;
    expect(service.progress$.value?.percentage).toBe(100);
  });

  it('blocks overlapping transfers without replacing the active peer', async () => {
    const peer = service.peer;
    await expect(service.openPeerConnection(handshake)).rejects.toThrow(
      'already in progress',
    );
    expect(service.peer).toBe(peer);
  });

  it('waits for backpressure and rejects cancellation without sending more bytes', async () => {
    channel.bufferedAmount = 3 * 1024 * 1024;
    const transfer = service.sendFile(file(100));
    const rejected = expect(transfer).rejects.toThrow('interrupted');
    await settle();
    expect(channel.sent).toHaveLength(1);
    service.close();
    await rejected;
    expect(channel.sent).toHaveLength(1);
  });

  it('resumes when the send buffer drains', async () => {
    channel.bufferedAmount = 3 * 1024 * 1024;
    const transfer = service.sendFile(file(100));
    await settle();
    channel.bufferedAmount = 0;
    channel.dispatchEvent(new Event('bufferedamountlow'));
    await settle();
    channel.message(JSON.stringify({ type: 'ack', size: 100 }));
    await transfer;
    expect(service.progress$.value?.percentage).toBe(100);
  });

  it('times out missing receiver confirmation', async () => {
    const transfer = service.sendFile(file(0));
    const rejected = expect(transfer).rejects.toThrow('confirmation timed out');
    jest.advanceTimersByTime(120000);
    await rejected;
    expect(service.progress$.value?.percentage).not.toBe(100);
  });

  function receive() {
    if (service.handshake) service.handshake.direction = 'inbound';
    channel.message(
      JSON.stringify({
        type: 'meta',
        name: 'received.bin',
        size: 3,
        mime: '',
        ack: true,
      }),
    );
  }

  it('does not send its own published file when receiving', () => {
    service.publishedFile = file(100);
    if (service.handshake) service.handshake.direction = 'inbound';
    channel.onopen?.();
    expect(channel.sent).toHaveLength(0);
    expect(channel.binaryType).toBe('arraybuffer');
  });

  it('accepts Blob and ArrayBuffer data, validates size and confirms reception', () => {
    receive();
    channel.message(new Blob([new Uint8Array([1])]));
    channel.message(new Uint8Array([2, 3]).buffer);
    channel.message(JSON.stringify({ type: 'end' }));
    expect(errors).toEqual([]);
    expect(URL.createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ size: 3 }),
    );
    expect(channel.sent).toContain(JSON.stringify({ type: 'ack', size: 3 }));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(service.progress$.value?.percentage).toBe(100);
    channel.onclose?.();
    expect(service.busy).toBe(false);
  });

  it.each([
    [
      'truncated file',
      [new Uint8Array([1]).buffer, JSON.stringify({ type: 'end' })],
    ],
    ['oversized file', [new Uint8Array(4).buffer]],
    [
      'duplicate metadata',
      [JSON.stringify({ type: 'meta', name: 'x', size: 0, mime: '' })],
    ],
    ['malformed JSON', ['{']],
  ])('rejects %s without creating a download', (_, messages) => {
    receive();
    messages.forEach((message) => channel.message(message));
    expect(errors).toHaveLength(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(service.busy).toBe(false);
  });

  it('rejects data arriving before metadata', () => {
    if (service.handshake) service.handshake.direction = 'inbound';
    channel.message(new Uint8Array(1).buffer);
    expect(errors).toHaveLength(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
