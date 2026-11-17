import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { EmojiOverlay } from "./EmojiOverlay";
import type { DonationEvent, FacePoints } from "../types";

interface Props {
  videoRef?: RefObject<HTMLVideoElement | null>;
  stream?: MediaStream | null;
  face: FacePoints;
  donations: DonationEvent[];
  muted?: boolean;
  mirror?: boolean;
  children?: ReactNode;
  className?: string;
}

export function VideoStage({
  videoRef: externalRef,
  stream,
  face,
  donations,
  muted = true,
  mirror = false,
  children,
  className = "",
}: Props) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalRef ?? internalRef;
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0, mw: 640, mh: 480 });

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [stream, videoRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const update = () => {
      const video = videoRef.current;
      setSize({
        w: stage.clientWidth,
        h: stage.clientHeight,
        mw: video?.videoWidth || 640,
        mh: video?.videoHeight || 480,
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(stage);
    const video = videoRef.current;
    video?.addEventListener("loadedmetadata", update);
    return () => {
      ro.disconnect();
      video?.removeEventListener("loadedmetadata", update);
    };
  }, [videoRef, stream]);

  return (
    <div className={`video-stage ${className}`} ref={stageRef}>
      <video
        ref={videoRef}
        className={mirror ? "mirror" : undefined}
        playsInline
        autoPlay
        muted={muted}
      />
      <EmojiOverlay
        face={face}
        donations={donations}
        containerWidth={size.w}
        containerHeight={size.h}
        mediaWidth={size.mw}
        mediaHeight={size.mh}
      />
      {children}
    </div>
  );
}
