import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WebRTCService {
  private _platformId = inject(PLATFORM_ID);
  peer!: RTCPeerConnection;
  channel: RTCDataChannel | null = null;

  constructor() {
    if (!isPlatformBrowser(this._platformId)) {
      return;
    }
    this.peer = new RTCPeerConnection();
  }

  createDataChannel(config: { user: string; fileName: string; room: string }) {
    this.channel = this.peer.createDataChannel(
      `channel-${config.user}-${config.fileName}-${config.room}`,
    );
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
}
