import { HttpClient } from '@angular/common/http';
import { inject, Injectable, NgZone, OnDestroy } from '@angular/core';
import type { WebRTCConfig } from '@svotao/interfaces';
import { BehaviorSubject, firstValueFrom, Subject, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

interface IWebRTCHandshake {
  to: string | null;
  from: string | null;
  direction: 'inbound' | 'outbound';
  status?: 'offering' | 'answered';
}
interface FileMeta {
  name: string;
  size: number;
  mime: string;
}
export interface IWebRTCProgress {
  handshake: IWebRTCHandshake;
  percentage: number;
  file: FileMeta;
}

@Injectable({ providedIn: 'root' })
export class WebRTCService implements OnDestroy {
  private _http = inject(HttpClient);
  private _zone = inject(NgZone);
  peer!: RTCPeerConnection;
  channel: RTCDataChannel | null = null;
  handshake: IWebRTCHandshake | null = null;
  publishedFile: File | null = null;
  private _rtcConfig: RTCConfiguration | null = null;
  private _queuedLocalCandidates: RTCIceCandidateInit[] = [];
  private _queuedRemoteCandidates: RTCIceCandidateInit[] = [];
  private _progressResetTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _watchdog: ReturnType<typeof setInterval> | null = null;
  private _lastActivity = 0;
  private _generation = 0;
  private _abort = new AbortController();
  private _sending = false;
  private _awaitingAck = false;
  private _receivedAck = new Subject<number>();
  public iceCandidates$ = new Subject<RTCIceCandidateInit>();
  public progress$ = new BehaviorSubject<IWebRTCProgress | null>(null);
  public error$ = new Subject<string>();
  public get busy(): boolean {
    return this.handshake !== null;
  }

  public async preloadRTCConfiguration(): Promise<void> {
    await this._getRTCConfiguration();
  }

  public fail(error: unknown): void {
    this.close();
    this._zone.run(() =>
      this.error$.next(
        error instanceof Error ? error.message : 'Transfer failed',
      ),
    );
  }

  public close(): void {
    this._generation++;
    this._abort.abort();
    if (this._watchdog) clearInterval(this._watchdog);
    this._watchdog = null;
    this._clearProgressResetTimeout();
    const channel = this.channel;
    this.channel = null;
    if (channel) {
      channel.onopen =
        channel.onmessage =
        channel.onclose =
        channel.onerror =
          null;
      channel.close();
    }
    if (this.peer) {
      this.peer.onicecandidate =
        this.peer.ondatachannel =
        this.peer.onconnectionstatechange =
          null;
      this.peer.close();
    }
    this.handshake = null;
    this._sending = false;
    this._awaitingAck = false;
    this._queuedLocalCandidates = [];
    this._queuedRemoteCandidates = [];
    this._zone.run(() => this.progress$.next(null));
  }

  ngOnDestroy(): void {
    this.close();
  }

  async openPeerConnection(handshake: IWebRTCHandshake) {
    if (this.busy) throw new Error('A transfer is already in progress');
    this.close();
    const generation = this._generation;
    this._abort = new AbortController();
    this.handshake = { ...handshake };
    this._lastActivity = Date.now();
    try {
      const config = await this._getRTCConfiguration();
      if (generation !== this._generation)
        throw new Error('Transfer cancelled');
      this._zone.runOutsideAngular(() => {
        const peer = (this.peer = new RTCPeerConnection(config));
        this._watchdog = setInterval(() => {
          if (Date.now() - this._lastActivity > 120000)
            this.fail(new Error('Transfer timed out. Please retry.'));
        }, 5000);
        peer.onicecandidate = (ev) => {
          if (!ev.candidate || this.peer !== peer) return;
          const candidate = ev.candidate.toJSON();
          if (
            this.handshake?.direction === 'outbound' &&
            this.handshake.status !== 'answered'
          ) {
            this._queuedLocalCandidates.push(candidate);
          } else this.iceCandidates$.next(candidate);
        };
        peer.ondatachannel = (ev) => {
          if (this.channel || this.handshake?.direction !== 'inbound') {
            ev.channel.close();
            return;
          }
          this.channel = ev.channel;
          this._setupChannelHandlers(ev.channel);
        };
        peer.onconnectionstatechange = () => {
          if (peer.connectionState === 'failed')
            this.fail(new Error('Peer connection failed. Please retry.'));
        };
      });
    } catch (error) {
      if (generation === this._generation) this.close();
      throw error;
    }
  }

  createDataChannel(config: {
    sourceUser: string;
    targetUser: string;
    fileName: string;
    room: string;
  }) {
    this._zone.runOutsideAngular(() => {
      this.channel = this.peer.createDataChannel(
        this.constructDataChannelName(
          config.sourceUser,
          config.targetUser,
          config.fileName,
          config.room,
        ),
      );
      this._setupChannelHandlers(this.channel);
    });
  }

  constructDataChannelName(
    sourceUser: string,
    targetUser: string,
    _fileName: string,
    room: string,
  ): string {
    return `data-channel:${room}|${sourceUser}-${targetUser}`;
  }

  private _assertPeer(peer: RTCPeerConnection) {
    if (this.peer !== peer || !this.busy) throw new Error('Transfer cancelled');
  }

  async receiveOffer(offer: RTCSessionDescriptionInit) {
    const peer = this.peer;
    await peer.setRemoteDescription(offer);
    this._assertPeer(peer);
    await this._flushQueuedRemoteCandidates(peer);
    const answer = await peer.createAnswer();
    this._assertPeer(peer);
    await peer.setLocalDescription(answer);
    this._assertPeer(peer);
    return answer;
  }

  async receiveAnswer(answer: RTCSessionDescriptionInit) {
    const peer = this.peer;
    await peer.setRemoteDescription(answer);
    this._assertPeer(peer);
    if (this.handshake) this.handshake.status = 'answered';
    await this._flushQueuedRemoteCandidates(peer);
    for (const candidate of this._queuedLocalCandidates.splice(0))
      this.iceCandidates$.next(candidate);
  }

  async createOffer() {
    const peer = this.peer;
    const offer = await peer.createOffer();
    this._assertPeer(peer);
    await peer.setLocalDescription(offer);
    this._assertPeer(peer);
    if (this.handshake) this.handshake.status = 'offering';
    return offer;
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.busy) return;
    if (!this.peer?.remoteDescription) {
      if (this._queuedRemoteCandidates.length >= 256)
        throw new Error('Too many ICE candidates');
      this._queuedRemoteCandidates.push(candidate);
      return;
    }
    await this.peer.addIceCandidate(candidate);
  }

  private async _flushQueuedRemoteCandidates(peer: RTCPeerConnection) {
    for (const candidate of this._queuedRemoteCandidates.splice(0)) {
      this._assertPeer(peer);
      await peer.addIceCandidate(candidate);
    }
  }

  public async sendFile(file: File, chunkSize = 64 * 1024) {
    const channel = this.channel;
    const signal = this._abort.signal;
    if (!channel || channel.readyState !== 'open')
      throw new Error('DataChannel is not open');
    if (this._sending) throw new Error('A file is already being sent');
    if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0)
      throw new Error('Invalid chunk size');
    this._sending = true;
    const maxMessageSize = this.peer.sctp?.maxMessageSize;
    chunkSize = Math.min(
      chunkSize,
      maxMessageSize && maxMessageSize > 0 ? maxMessageSize : 64 * 1024,
    );
    const meta: FileMeta = {
      name: file.name,
      size: file.size,
      mime: file.type,
    };
    channel.bufferedAmountLowThreshold = 512 * 1024;
    channel.send(JSON.stringify({ type: 'meta', ...meta, ack: true }));
    this._setProgress(meta, 0);
    let sent = 0;
    let lastProgress = performance.now();
    try {
      while (sent < file.size) {
        // Read in larger blocks to amortize file I/O; keep SCTP messages small.
        await this._waitForBufferedAmountLow(channel, 2 * 1024 * 1024, signal);
        const block = await file
          .slice(sent, Math.min(sent + 1024 * 1024, file.size))
          .arrayBuffer();
        if (!block.byteLength) throw new Error('Unable to read local file');
        for (let offset = 0; offset < block.byteLength; offset += chunkSize) {
          await this._waitForBufferedAmountLow(
            channel,
            2 * 1024 * 1024,
            signal,
          );
          const chunk = new Uint8Array(
            block,
            offset,
            Math.min(chunkSize, block.byteLength - offset),
          );
          if (signal.aborted || channel.readyState !== 'open')
            throw new Error('Transfer interrupted');
          channel.send(chunk);
          sent += chunk.byteLength;
          this._lastActivity = Date.now();
          if (performance.now() - lastProgress >= 150) {
            this._setProgress(meta, Math.min(99.9, (sent / file.size) * 100));
            lastProgress = performance.now();
          }
        }
      }
      // Register before sending end: a fast receiver can acknowledge immediately.
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          subscription.unsubscribe();
          signal.removeEventListener('abort', aborted);
        };
        const aborted = () => {
          cleanup();
          reject(new Error('Transfer interrupted'));
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('Receiver confirmation timed out'));
        }, 120000);
        const subscription = this._receivedAck.subscribe((size) => {
          cleanup();
          if (size === file.size) resolve();
          else reject(new Error('Receiver size mismatch'));
        });
        signal.addEventListener('abort', aborted, { once: true });
        if (signal.aborted) {
          aborted();
          return;
        }
        this._awaitingAck = true;
        try {
          channel.send(JSON.stringify({ type: 'end' }));
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
      this._complete(meta);
    } finally {
      if (!signal.aborted) this._sending = false;
    }
  }

  private _setupChannelHandlers(channel: RTCDataChannel) {
    const chunks: BlobPart[] = [];
    const batch: BlobPart[] = [];
    let batchBytes = 0;
    let meta: FileMeta | null = null;
    let received = 0;
    let lastProgress = 0;
    let complete = false;
    let ack = false;
    let senderAcknowledged = false;
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      this._lastActivity = Date.now();
      if (this.handshake?.direction !== 'outbound') return;
      const file = this.publishedFile;
      if (!file) {
        this.fail(new Error('Published file is no longer available'));
        return;
      }
      const generation = this._generation;
      void this.sendFile(file).catch((error) => {
        if (generation === this._generation) this.fail(error);
      });
    };
    channel.onmessage = (ev) => {
      try {
        this._lastActivity = Date.now();
        const data = ev.data;
        if (typeof data === 'string') {
          const msg = JSON.parse(data);
          if (
            msg?.type === 'ack' &&
            this.handshake?.direction === 'outbound' &&
            this._awaitingAck
          ) {
            senderAcknowledged = true;
            this._receivedAck.next(msg.size);
            return;
          }
          if (this.handshake?.direction !== 'inbound' || complete)
            throw new Error('Unexpected transfer message');
          if (msg?.type === 'meta') {
            if (
              meta ||
              typeof msg.name !== 'string' ||
              !msg.name.length ||
              msg.name.length > 4096 ||
              !Number.isSafeInteger(msg.size) ||
              msg.size < 0 ||
              typeof msg.mime !== 'string'
            )
              throw new Error('Invalid file metadata');
            meta = { name: msg.name, size: msg.size, mime: msg.mime };
            ack = msg.ack === true;
            this._setProgress(meta, 0);
          } else if (msg?.type === 'end') {
            if (!meta || received !== meta.size)
              throw new Error('Incomplete file received. Please retry.');
            const blob = new Blob([...chunks, ...batch], {
              type: meta.mime || 'application/octet-stream',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = meta.name;
            document.body.appendChild(a);
            try {
              a.click();
            } finally {
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 60000);
            }
            chunks.length = batch.length = 0;
            complete = true;
            if (ack)
              channel.send(JSON.stringify({ type: 'ack', size: received }));
            // Keep the receiver alive until the sender closes, so its ACK can drain.
            this._setProgress(meta, 100);
            this._resetProgress();
            if (!ack) this._complete(meta);
          } else throw new Error('Unknown transfer message');
          return;
        }
        if (!meta || complete)
          throw new Error('File data received without metadata');
        const size =
          data instanceof ArrayBuffer
            ? data.byteLength
            : data instanceof Blob
              ? data.size
              : -1;
        if (size <= 0 || received + size > meta.size)
          throw new Error('Invalid file data size');
        batch.push(data);
        batchBytes += size;
        if (batchBytes >= 4 * 1024 * 1024) {
          chunks.push(new Blob(batch));
          batch.length = 0;
          batchBytes = 0;
        }
        received += size;
        if (performance.now() - lastProgress >= 150) {
          this._setProgress(meta, Math.min(99.9, (received / meta.size) * 100));
          lastProgress = performance.now();
        }
      } catch (error) {
        chunks.length = batch.length = 0;
        this.fail(error);
      }
    };
    channel.onclose = () => {
      chunks.length = batch.length = 0;
      if (senderAcknowledged) return;
      if (complete && meta) this._complete(meta);
      else
        this.fail(new Error('Connection closed before the transfer completed'));
    };
    channel.onerror = () => {
      chunks.length = batch.length = 0;
      this.fail(new Error('DataChannel error. Please retry.'));
    };
  }

  private _complete(meta: FileMeta) {
    const handshake = this.handshake ? { ...this.handshake } : null;
    this.close();
    if (handshake)
      this._zone.run(() =>
        this.progress$.next({ handshake, file: meta, percentage: 100 }),
      );
    this._resetProgress();
  }

  private _setProgress(file: FileMeta, percentage: number) {
    this._clearProgressResetTimeout();
    if (this.handshake) {
      const progress = { handshake: { ...this.handshake }, file, percentage };
      this._zone.run(() => this.progress$.next(progress));
    }
  }
  private _resetProgress() {
    this._clearProgressResetTimeout();
    this._progressResetTimeoutId = setTimeout(() => {
      this._zone.run(() => this.progress$.next(null));
      this._progressResetTimeoutId = null;
    }, 5000);
  }
  private _clearProgressResetTimeout() {
    if (this._progressResetTimeoutId)
      clearTimeout(this._progressResetTimeoutId);
    this._progressResetTimeoutId = null;
  }

  private async _waitForBufferedAmountLow(
    channel: RTCDataChannel,
    highWaterMark: number,
    signal: AbortSignal,
  ) {
    if (signal.aborted || channel.readyState !== 'open')
      throw new Error('Transfer interrupted');
    if (channel.bufferedAmount <= highWaterMark) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        channel.removeEventListener('bufferedamountlow', drained);
        channel.removeEventListener('close', closed);
        channel.removeEventListener('error', closed);
        signal.removeEventListener('abort', closed);
      };
      const drained = () => {
        cleanup();
        resolve();
      };
      const closed = () => {
        cleanup();
        reject(
          new Error('Transfer interrupted while waiting for buffer drain'),
        );
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Transfer stalled while waiting for buffer drain'));
      }, 120000);
      channel.addEventListener('bufferedamountlow', drained, { once: true });
      channel.addEventListener('close', closed, { once: true });
      channel.addEventListener('error', closed, { once: true });
      signal.addEventListener('abort', closed, { once: true });
      if (signal.aborted || channel.readyState !== 'open') closed();
      else if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold)
        drained();
    });
  }

  private async _getRTCConfiguration(): Promise<RTCConfiguration> {
    if (this._rtcConfig) {
      return this._rtcConfig;
    }

    const fallbackConfig: RTCConfiguration = {
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
          ],
        },
      ],
    };

    try {
      const config = await firstValueFrom(
        this._http
          .get<WebRTCConfig>(`${environment.apiUrl}/api/rtc-config`)
          .pipe(timeout(5000)),
      );

      this._rtcConfig = {
        iceServers: config.iceServers.length
          ? config.iceServers
          : fallbackConfig.iceServers,
        iceTransportPolicy: config.iceTransportPolicy || 'all',
      };
    } catch (error) {
      console.warn('Unable to load RTC configuration, using fallback:', error);
      return fallbackConfig;
    }

    return this._rtcConfig;
  }
}
