import { Injectable } from '@angular/core';
import { SocketConnectionHandlerService } from 'vecholib/angular/services';

@Injectable({
  providedIn: 'root',
})
export class SocketService extends SocketConnectionHandlerService {
  override appEvents(): void {
    this.socket?.on('foo', () => console.log('foo event received'));
  }
}
