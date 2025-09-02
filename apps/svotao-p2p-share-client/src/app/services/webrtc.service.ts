import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WebRTCService {
  private _platformId = inject(PLATFORM_ID);
  peer!: RTCPeerConnection;
  channel: RTCDataChannel | null = null;
  handshake: {
    to: string | null;
    from: string | null;
    direction: 'inbound' | 'outbound';
    status?: 'offering' | 'answered';
  } | null = null;
  publishedFile: File | null = null;

  public iceCandidates$ = new Subject<RTCIceCandidateInit>();

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
    // Ora puoi creare la answer
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    // Restituisci la answer per inviarla tramite socket
    return answer;
  }

  async receiveAnswer(answer: RTCSessionDescriptionInit) {
    await this.peer.setRemoteDescription(new RTCSessionDescription(answer));
    if (!this.handshake) {
      return;
    }
    this.handshake.status = 'answered';
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
      throw new Error('DataChannel is not open');
    }

    console.log('Starting file send:', file.name, 'size:', file.size);

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
      if (done) {
        break;
      }
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
    this.handshake = null;
    this.channel = null;
    // this.peer.close();

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
    this.peer = new RTCPeerConnection();

    // inoltra candidati locali
    this.peer.onicecandidate = (ev) => {
      if (
        !ev.candidate ||
        (this.handshake?.status !== 'answered' &&
          this.handshake?.direction === 'outbound')
      ) {
        return;
      }

      console.log('New ICE candidate:', ev.candidate);

      this.iceCandidates$.next(ev.candidate.toJSON());
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
      this.sendFile(this.publishedFile, 64 * 1024);
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
