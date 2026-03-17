import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

interface IWebRTCHandshake {
  to: string | null;
  from: string | null;
  direction: 'inbound' | 'outbound';
  status?: 'offering' | 'answered';
}

export interface IWebRTCProgress {
  handshake: IWebRTCHandshake;
  percentage: number;
  file: {
    name: string;
    size: number;
    mime: string;
  };
}

@Injectable({ providedIn: 'root' })
export class WebRTCService {
  peer!: RTCPeerConnection;
  channel: RTCDataChannel | null = null;
  handshake: IWebRTCHandshake | null = null;
  publishedFile: File | null = null;
  private _queuedLocalCandidates: RTCIceCandidateInit[] = [];
  private _queuedRemoteCandidates: RTCIceCandidateInit[] = [];
  private _progressResetTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private _lastKnownHandshake: IWebRTCHandshake | null = null;

  public iceCandidates$ = new Subject<RTCIceCandidateInit>();
  public progress$ = new BehaviorSubject<IWebRTCProgress | null>(null);

  createDataChannel(config: {
    sourceUser: string;
    targetUser: string;
    fileName: string;
    room: string;
  }) {
    console.log('Creating DataChannel for file:', config.fileName);

    this.channel = this.peer.createDataChannel(
      this.constructDataChannelName(
        config.sourceUser,
        config.targetUser,
        config.fileName,
        config.room,
      ),
    );
    this._setupChannelHandlers();
  }

  async receiveOffer(offer: RTCSessionDescriptionInit) {
    await this.peer.setRemoteDescription(new RTCSessionDescription(offer));
    await this._flushQueuedRemoteCandidates();
    // Ora puoi creare la answer
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    // Restituisci la answer per inviarla tramite socket
    return answer;
  }

  async receiveAnswer(answer: RTCSessionDescriptionInit) {
    await this.peer.setRemoteDescription(new RTCSessionDescription(answer));
    if (!this.handshake) {
      await this._flushQueuedRemoteCandidates();
      this._flushQueuedLocalCandidates();
      return;
    }

    this.handshake.status = 'answered';
    await this._flushQueuedRemoteCandidates();
    this._flushQueuedLocalCandidates();
  }

  async createOffer() {
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);

    if (!this.handshake) {
      return offer;
    }

    this.handshake.status = 'offering';
    return offer;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit) {
    await this.peer.setRemoteDescription(desc);
    await this._flushQueuedRemoteCandidates();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.peer.remoteDescription) {
      this._queuedRemoteCandidates.push(candidate);
      console.log(
        'Remote description not ready, queueing ICE candidate:',
        candidate,
      );
      return;
    }

    try {
      await this.peer.addIceCandidate(candidate);
    } catch (error) {
      console.warn(
        'Failed to add ICE candidate immediately, queueing for retry:',
        error,
      );
      this._queuedRemoteCandidates.push(candidate);
    }
  }

  // chiamare SOLO dopo channel.onopen
  public async sendFile(file: File, chunkSize = 256 * 1024) {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('DataChannel is not open');
    }

    console.log('Starting file send:', file.name, 'size:', file.size);

    const highWaterMarkBytes = 8 * 1024 * 1024;
    const lowWaterMarkBytes = 2 * 1024 * 1024;
    const progressIntervalMs = 150;
    this.channel.bufferedAmountLowThreshold = lowWaterMarkBytes;

    // invia metadati
    this.channel.send(
      JSON.stringify({
        type: 'meta',
        name: file.name,
        size: file.size,
        mime: file.type,
      }),
    );

    let sent = 0;
    let lastProgressUpdateMs = 0;

    while (sent < file.size) {
      await this._waitForBufferedAmountLow(this.channel, highWaterMarkBytes);

      const chunkEnd = Math.min(sent + chunkSize, file.size);
      let chunk: ArrayBuffer;

      try {
        chunk = await file.slice(sent, chunkEnd).arrayBuffer();
      } catch (error) {
        console.error('Unable to read local file chunk while sending:', {
          fileName: file.name,
          offset: sent,
          chunkEnd,
          error,
        });
        throw error;
      }

      if (!this.channel || this.channel.readyState !== 'open') {
        throw new Error('DataChannel closed while sending file');
      }

      this.channel.send(chunk);
      sent = chunkEnd;

      const now = performance.now();
      const progress = (sent / file.size) * 100;
      if (progress >= 100 || now - lastProgressUpdateMs >= progressIntervalMs) {
        this._setProgress({
          handshake: this._resolveProgressHandshake(),
          percentage: progress,
          file: {
            name: this.publishedFile?.name || '',
            size: this.publishedFile?.size || 0,
            mime: this.publishedFile?.type || '',
          },
        });
        lastProgressUpdateMs = now;
      }
    }

    // fine
    this.channel.send(JSON.stringify({ type: 'end' }));
    this.handshake = null;
    this.channel = null;
    this._resetProgress();

    console.log('file sent');
  }

  public constructDataChannelName(
    sourceUser: string,
    targetUser: string,
    fileName: string,
    room: string,
  ): string {
    return `data-channel:${room}|${sourceUser}-${targetUser}|${fileName}`;
  }

  public openPeerConnection() {
    this._queuedLocalCandidates = [];
    this._queuedRemoteCandidates = [];
    this.peer = new RTCPeerConnection({
      // STUN pubblico di fallback per connettività cross-network.
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
    });

    // inoltra candidati locali
    this.peer.onicecandidate = (ev) => {
      if (!ev.candidate) {
        return;
      }

      const candidate = ev.candidate.toJSON();
      if (
        this.handshake?.direction === 'outbound' &&
        this.handshake?.status !== 'answered'
      ) {
        this._queuedLocalCandidates.push(candidate);
        console.log('Queueing local ICE candidate until answer is received');
        return;
      }

      console.log('New ICE candidate:', ev.candidate);

      this.iceCandidates$.next(candidate);
    };

    // ricezione datachannel (quando l'altro peer crea il channel)
    this.peer.ondatachannel = (ev) => {
      console.log('DataChannel received:', ev.channel.label);
      this.channel = ev.channel;
      this._setupChannelHandlers();
    };

    this.peer.addEventListener('connectionstatechange', () => {
      console.log('WebRTC connection state:', this.peer.connectionState);
    });
  }

  private _setupChannelHandlers() {
    if (!this.channel) {
      return;
    }

    const chunks: ArrayBuffer[] = [];
    let expectedSize = 0;
    let received = 0;
    let currentMeta: { name?: string; size?: number; mime?: string } | null =
      null;

    this.channel.onopen = () => {
      console.log('DataChannel open', this.publishedFile);
      if (!this.publishedFile) {
        return;
      }
      this.sendFile(this.publishedFile).catch((error) => {
        console.error('Failed to send file via DataChannel:', error);
      });
    };

    this.channel.onmessage = (ev) => {
      const data = ev.data;
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'meta') {
            currentMeta = { name: msg.name, size: msg.size, mime: msg.mime };
            expectedSize = msg.size || 0;
            received = 0;
            chunks.length = 0;
            console.log('Receiving file meta', currentMeta);
          } else if (msg.type === 'end') {
            // ricostruisci e fornisci download
            const blob = new Blob(chunks, {
              type: currentMeta?.mime || 'application/octet-stream',
            });
            const url = URL.createObjectURL(blob);

            console.log(
              'File received:',
              currentMeta?.name,
              ' size:',
              blob.size,
            );
            // esempio: apri url o emetti evento
            const a = document.createElement('a');
            a.href = url;
            a.download = currentMeta?.name || 'download';
            a.click();
            URL.revokeObjectURL(url);
            this._resetProgress();
            currentMeta = null;
            chunks.length = 0;
          }
        } catch {
          // non JSON: ignora/slog
        }
        return;
      }

      // binario: ArrayBuffer / Blob etc.
      const ab =
        data instanceof ArrayBuffer ? data : data.buffer ? data.buffer : null;
      if (ab) {
        chunks.push(ab);
        received += ab.byteLength;

        const progress = (received / (expectedSize || 1)) * 100;

        this._setProgress({
          handshake: this._resolveProgressHandshake(),
          percentage: progress,
          file: {
            name: currentMeta?.name || '',
            size: currentMeta?.size || 0,
            mime: currentMeta?.mime || '',
          },
        });
      }
    };
    this.channel.onclose = () => console.log('DataChannel closed');
    this.channel.onerror = (err) => console.error('DataChannel error', err);
  }

  private _resetProgress() {
    this._clearProgressResetTimeout();
    this._progressResetTimeoutId = setTimeout(() => {
      this.progress$.next(null);
      this._progressResetTimeoutId = null;
    }, 5000);
  }

  private _clearProgressResetTimeout() {
    if (!this._progressResetTimeoutId) {
      return;
    }

    clearTimeout(this._progressResetTimeoutId);
    this._progressResetTimeoutId = null;
  }

  private _setProgress(progress: IWebRTCProgress) {
    this._clearProgressResetTimeout();
    this.progress$.next(progress);
  }

  private async _waitForBufferedAmountLow(
    channel: RTCDataChannel,
    highWaterMarkBytes: number,
  ) {
    if (channel.bufferedAmount <= highWaterMarkBytes) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const onBufferedAmountLow = () => {
        cleanup();
        resolve();
      };

      const onChannelClosed = () => {
        cleanup();
        reject(new Error('DataChannel closed while waiting for buffer drain'));
      };

      const cleanup = () => {
        channel.removeEventListener('bufferedamountlow', onBufferedAmountLow);
        channel.removeEventListener('close', onChannelClosed);
        channel.removeEventListener('error', onChannelClosed);
      };

      channel.addEventListener('bufferedamountlow', onBufferedAmountLow, {
        once: true,
      });
      channel.addEventListener('close', onChannelClosed, {
        once: true,
      });
      channel.addEventListener('error', onChannelClosed, {
        once: true,
      });
    });
  }

  private _resolveProgressHandshake(): IWebRTCHandshake {
    if (this.handshake) {
      this._lastKnownHandshake = { ...this.handshake };
      return this._lastKnownHandshake;
    }

    if (this._lastKnownHandshake) {
      return this._lastKnownHandshake;
    }

    return {
      to: null,
      from: null,
      direction: 'inbound',
    };
  }

  private _flushQueuedLocalCandidates() {
    if (!this._queuedLocalCandidates.length) {
      return;
    }

    for (const candidate of this._queuedLocalCandidates) {
      this.iceCandidates$.next(candidate);
    }

    console.log('Flushed queued local ICE candidates');
    this._queuedLocalCandidates = [];
  }

  private async _flushQueuedRemoteCandidates() {
    if (!this._queuedRemoteCandidates.length || !this.peer.remoteDescription) {
      return;
    }

    const pending = [...this._queuedRemoteCandidates];
    this._queuedRemoteCandidates = [];

    for (const candidate of pending) {
      try {
        await this.peer.addIceCandidate(candidate);
      } catch (error) {
        console.warn(
          'Failed to flush queued ICE candidate, keeping in queue:',
          error,
        );
        this._queuedRemoteCandidates.push(candidate);
      }
    }
  }
}
