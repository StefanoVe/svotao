import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WebRTCService {
  private _platformId = inject(PLATFORM_ID);
  peer!: RTCPeerConnection;
  channel: RTCDataChannel | null = null;
  targetUser: string | null = null;
  fileToSend: File | null = null;
  public iceCandidates$ = new Subject<RTCIceCandidateInit>();

  constructor() {
    if (!isPlatformBrowser(this._platformId)) {
      return;
    }
    this.peer = new RTCPeerConnection();
    // inoltra candidati locali
    this.peer.onicecandidate = (ev) => {
      console.log('New ICE candidate:', ev.candidate);
      if (ev.candidate) {
        this.iceCandidates$.next(ev.candidate.toJSON());
      }
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

  createDataChannel(config: {
    sourceUser: string;
    targetUser: string;
    fileName: string;
    room: string;
  }) {
    this.targetUser = config.targetUser;

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
    // Ora puoi creare la answer
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    // Restituisci la answer per inviarla tramite socket
    return answer;
  }

  async receiveAnswer(answer: RTCSessionDescriptionInit) {
    await this.peer.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async createOffer() {
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    return offer;
  }

  async createAnswer() {
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit) {
    await this.peer.setRemoteDescription(desc);
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    await this.peer.addIceCandidate(candidate);
  }

  private async _sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // chiamare SOLO dopo channel.onopen
  public async sendFile(file: File, chunkSize = 64 * 1024) {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('DataChannel non aperto');
    }

    // invia metadati
    this.channel.send(
      JSON.stringify({
        type: 'meta',
        name: file.name,
        size: file.size,
        mime: file.type,
      }),
    );

    const stream = file.stream();
    const reader = stream.getReader();
    let sent = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // value è Uint8Array
      // spezzalo in pezzi di chunkSize se necessario
      let offset = 0;
      while (offset < value.byteLength) {
        const slice = value.slice(offset, offset + chunkSize);
        // backpressure
        while (this.channel.bufferedAmount > 512 * 1024) {
          await this._sleep(50);
        }
        this.channel.send(slice);
        sent += slice.byteLength;
        offset += chunkSize;
        // opzionale: emetti progress event (es. via Subject)
        console.log('send progress', (sent / file.size) * 100);
      }
    }

    // fine
    this.channel.send(JSON.stringify({ type: 'end' }));
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
      if (!this.fileToSend) {
        console.error(`No file to send`);
        return;
      }
      this.sendFile(this.fileToSend, 64 * 1024);
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
        console.log('receive progress', (received / (expectedSize || 1)) * 100);
      }
    };
    this.channel.onclose = () => console.log('DataChannel closed');
    this.channel.onerror = (err) => console.error('DataChannel error', err);
  }
}
