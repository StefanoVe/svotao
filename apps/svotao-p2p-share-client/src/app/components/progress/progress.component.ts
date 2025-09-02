import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { IWebRTCProgress } from '../../services/webrtc.service';

@Component({
  selector: 'svotao-p2p-share-progress',
  imports: [CommonModule],
  templateUrl: './progress.component.html',
  styleUrl: './progress.component.css',
})
export class ProgressComponent {
  @Input() progress!: IWebRTCProgress;
  public elapsed = Date.now();

  public get downloadSpeed(): number {
    return this.progress.file.size / this.elapsed;
  }
}
