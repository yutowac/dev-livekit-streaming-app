export type FaceAnchor =
  | "side"
  | "sideRight"
  | "sideRightUp"
  | "sideRightDown"
  | "center"
  | "mouth"
  | "forehead"
  | "below"
  | "above";

export type EffectId =
  | "clap"
  | "chick"
  | "heart"
  | "cat"
  | "melon"
  | "burger"
  | "party"
  | "pig"
  | "poop"
  | "crown";

export interface Point {
  x: number;
  y: number;
}

export interface FacePoints {
  side: Point;
  sideRight: Point;
  sideRightUp: Point;
  sideRightDown: Point;
  center: Point;
  mouth: Point;
  forehead: Point;
  below: Point;
  above: Point;
  detected: boolean;
}

export interface DonationEvent {
  id: string;
  deviceId: string;
  userName: string;
  amount: number;
  emoji: string;
  effectId: EffectId;
  anchors: FaceAnchor[];
  createdAt: number;
}

export interface RoomSnapshot {
  maxViewers: number;
  viewerCount: number;
  sessionTotal: number;
  donations: DonationEvent[];
  face: FacePoints;
  publicUrl: string;
  livekitConfigured: boolean;
}

export interface JoinResult extends RoomSnapshot {
  ok: boolean;
  error?: string;
  message?: string;
  deviceId?: string;
  userName?: string;
  balance?: number;
}
