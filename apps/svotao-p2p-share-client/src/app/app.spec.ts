import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
} from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { App } from './app';
import { SocketService } from './services/socket.service';
import { WebRTCService } from './services/webrtc.service';
import { ToastrService } from 'vecholib/angular/modules';

jest.mock('./services/socket.service', () => ({ SocketService: class {} }));
jest.mock('./services/webrtc.service', () => ({ WebRTCService: class {} }));
jest.mock('vecholib/angular/modules', () => ({ ToastrService: class {} }));

describe('peer visibility', () => {
  let fixture: ComponentFixture<App>;
  const room = (ids: string[]) => ({
    room: 'test',
    sockets: ids.map((id) => ({ id })),
    socketsData: Object.fromEntries(
      ['self', ...ids].map((id) => [
        id,
        {
          backgroundColor: '#123456',
          file: { name: 'example.txt', size: 10 },
        },
      ]),
    ),
  });
  let rooms: BehaviorSubject<ReturnType<typeof room>>;

  beforeEach(async () => {
    rooms = new BehaviorSubject(room([]));
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: Router,
          useValue: { navigate: jest.fn().mockResolvedValue(true) },
        },
        { provide: ToastrService, useValue: { error: jest.fn() } },
        {
          provide: SocketService,
          useValue: {
            roomData$: rooms,
            socketData$: new BehaviorSubject({ room: 'test', userId: 'self' }),
            connect: jest.fn(),
            disconnect: jest.fn(),
          },
        },
        {
          provide: WebRTCService,
          useValue: {
            error$: new Subject(),
            progress$: new BehaviorSubject(null),
            busy: false,
            preloadRTCConfiguration: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();
  });

  it('reveals both existing and newly joined peers after positioning', fakeAsync(() => {
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    rooms.next(room(['first']));
    fixture.detectChanges();
    tick(1000);
    const first = fixture.nativeElement.querySelector('.circle') as HTMLElement;
    expect(first.style.opacity).toBe('1');
    expect(first.style.transform).toContain('translate(');

    rooms.next(room(['first', 'second']));
    fixture.detectChanges();
    tick(1000);
    const peers = Array.from(
      fixture.nativeElement.querySelectorAll('.circle'),
    ) as HTMLElement[];
    expect(peers).toHaveLength(2);
    expect(peers.every((peer) => peer.style.opacity === '1')).toBe(true);
    expect(peers[0].style.transform).not.toBe(peers[1].style.transform);

    fixture.componentInstance.layoutPeers();
    expect(peers.every((peer) => peer.style.opacity === '1')).toBe(true);
  }));
});
