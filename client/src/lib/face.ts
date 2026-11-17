import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import type { FacePoints, Point } from "../types";

const MODEL_URL = "/mediapipe/face_landmarker.task";
const WASM_URL = "/mediapipe/wasm";

type FaceLandmarkerType = import("@mediapipe/tasks-vision").FaceLandmarker;

let landmarkerPromise: Promise<FaceLandmarkerType> | null = null;

async function getLandmarker(): Promise<FaceLandmarkerType> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import(
        "@mediapipe/tasks-vision"
      );
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      try {
        return await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      } catch {
        return FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      }
    })();
  }
  return landmarkerPromise;
}

function landmark(result: FaceLandmarkerResult, index: number): Point {
  const lm = result.faceLandmarks[0][index];
  return { x: lm.x, y: lm.y };
}

function average(points: Point[]): Point {
  const n = points.length || 1;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

export function extractFacePoints(result: FaceLandmarkerResult | null): FacePoints {
  if (!result?.faceLandmarks?.length) {
    return createDefaultFace();
  }

  const foreheadLm = landmark(result, 10);
  const chin = landmark(result, 152);
  const nose = landmark(result, 1);
  const leftCheek = landmark(result, 234);
  const rightCheek = landmark(result, 454);
  const mouth = average([landmark(result, 13), landmark(result, 14)]);

  const faceHeight = Math.max(0.08, chin.y - foreheadLm.y);
  const faceWidth = Math.max(0.08, Math.abs(rightCheek.x - leftCheek.x));

  // 画面に向かって左／右の頬
  const screenLeft = leftCheek.x <= rightCheek.x ? leftCheek : rightCheek;
  const screenRight = leftCheek.x <= rightCheek.x ? rightCheek : leftCheek;

  const side = {
    x: Math.max(0, screenLeft.x - faceWidth * 0.22),
    y: screenLeft.y,
  };
  const sideRight = {
    x: Math.min(1, screenRight.x + faceWidth * 0.22),
    y: screenRight.y,
  };

  return {
    side,
    sideRight,
    sideRightUp: {
      x: sideRight.x,
      y: Math.max(0, sideRight.y - faceHeight * 0.22),
    },
    sideRightDown: {
      x: sideRight.x,
      y: Math.min(1, sideRight.y + faceHeight * 0.22),
    },
    center: average([nose, landmark(result, 4)]),
    mouth,
    forehead: {
      x: foreheadLm.x,
      y: foreheadLm.y + faceHeight * 0.08,
    },
    below: {
      x: chin.x,
      y: Math.min(1, chin.y + faceHeight * 0.35),
    },
    above: {
      x: foreheadLm.x,
      y: Math.max(0, foreheadLm.y - faceHeight * 0.4),
    },
    detected: true,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** 直前の顔座標へ寄せてカクつきを抑える */
export function smoothFacePoints(
  previous: FacePoints | null,
  next: FacePoints,
  t = 0.4,
): FacePoints {
  if (!previous || !next.detected) return next;
  if (!previous.detected) return next;
  return {
    side: lerpPoint(previous.side, next.side, t),
    sideRight: lerpPoint(previous.sideRight, next.sideRight, t),
    sideRightUp: lerpPoint(previous.sideRightUp, next.sideRightUp, t),
    sideRightDown: lerpPoint(previous.sideRightDown, next.sideRightDown, t),
    center: lerpPoint(previous.center, next.center, t),
    mouth: lerpPoint(previous.mouth, next.mouth, t),
    forehead: lerpPoint(previous.forehead, next.forehead, t),
    below: lerpPoint(previous.below, next.below, t),
    above: lerpPoint(previous.above, next.above, t),
    detected: true,
  };
}

export async function detectFace(
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<FacePoints> {
  const landmarker = await getLandmarker();
  const result = landmarker.detectForVideo(video, timestampMs);
  return extractFacePoints(result);
}

export function createDefaultFace(): FacePoints {
  return {
    side: { x: 0.2, y: 0.45 },
    sideRight: { x: 0.8, y: 0.45 },
    sideRightUp: { x: 0.8, y: 0.32 },
    sideRightDown: { x: 0.8, y: 0.58 },
    center: { x: 0.5, y: 0.45 },
    mouth: { x: 0.5, y: 0.58 },
    forehead: { x: 0.5, y: 0.28 },
    below: { x: 0.5, y: 0.75 },
    above: { x: 0.5, y: 0.15 },
    detected: false,
  };
}
