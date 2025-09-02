export enum EnumSocketIOAppEvents {
  SocketReady = 'socket:ready',
  RoomUpdated = 'room:updated',
  PublishFile = 'file:publish',
  RequestFile = 'file:request',
  AcceptFileRequest = 'file:request:accept',
  AcceptFileOffer = 'file:offer:accept',
  RTCOffer = 'file:webrtc:offer',
  RTCAnswer = 'file:webrtc:answer',
  RTCIceCandidate = 'file:webrtc:icecandidate',
  AddRTCIceCandidate = 'file:webrtc:icecandidate:add',
}

export interface SocketioRoom {
  socketData: {
    backgroundColor: string;
    file?: {
      name: string;
      size: number;
      type: string;
    };
  };
}
