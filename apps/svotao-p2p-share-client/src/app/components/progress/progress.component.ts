import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import { IWebRTCProgress } from '../../services/webrtc.service';

@Component({
  selector: 'svotao-p2p-share-progress',
  imports: [CommonModule],
  templateUrl: './progress.component.html',
  styleUrl: './progress.component.css',
})
export class ProgressComponent implements OnChanges {
  @Input() progress!: IWebRTCProgress;
  private _transferKey = '';
  private _startAtMs = 0;
  public speedBytesPerSec = 0;

  ngOnChanges(): void {
    if (!this.progress) {
      return;
    }

    const transferKey = `${this.progress.file.name}|${this.progress.handshake.from}|${this.progress.handshake.to}|${this.progress.handshake.direction}`;
    const now = performance.now();

    if (transferKey !== this._transferKey) {
      this._transferKey = transferKey;
      this._startAtMs = now;
      this.speedBytesPerSec = 0;
      return;
    }

    const transferredBytes =
      (this.progress.file.size * this.progress.percentage) / 100;
    const elapsedMs = Math.max(1, now - this._startAtMs);
    this.speedBytesPerSec = (transferredBytes / elapsedMs) * 1000;
  }

  public get formattedSpeed(): string {
    if (!Number.isFinite(this.speedBytesPerSec) || this.speedBytesPerSec <= 0) {
      return '0 B/s';
    }

    if (this.speedBytesPerSec >= 1024 * 1024) {
      return `${(this.speedBytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
    }

    if (this.speedBytesPerSec >= 1024) {
      return `${(this.speedBytesPerSec / 1024).toFixed(2)} KB/s`;
    }

    return `${this.speedBytesPerSec.toFixed(0)} B/s`;
  }
}
