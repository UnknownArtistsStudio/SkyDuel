"use client";

import { useEffect, useRef } from "react";
import { drawGameCloud, drawGamePlaneSprite } from "./render-game";

const WIDTH = 768;
const HEIGHT = 512;
const MASK_SCALE = 4;
const SKY = "#9b90f4";
const WHITE = "#fffdf8";

type Point = { x: number; y: number };
type CloudFlight = {
  anchor: Point;
  color: string;
  controlOne: Point;
  controlTwo: Point;
  delay: number;
};

const FLIGHTS: CloudFlight[] = [
  {
    anchor: { x: 190, y: 148 },
    controlOne: { x: 58, y: 210 },
    controlTwo: { x: 86, y: 360 },
    color: "#f02b10",
    delay: 0,
  },
  {
    anchor: { x: 438, y: 142 },
    controlOne: { x: 624, y: 64 },
    controlTwo: { x: 704, y: 278 },
    color: "#00ad38",
    delay: 5.1,
  },
  {
    anchor: { x: 622, y: 150 },
    controlOne: { x: 706, y: 246 },
    controlTwo: { x: 524, y: 390 },
    color: "#f2a913",
    delay: 10.2,
  },
];

export function TitleCloudScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    context.imageSmoothingEnabled = false;
    let titleLayer = drawCloudTitle();
    let animationFrame = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const render = (time: number) => {
      drawIntroFrame(context, titleLayer, reducedMotion ? 0 : time / 1000);
      if (!reducedMotion) animationFrame = window.requestAnimationFrame(render);
    };

    void document.fonts.ready.then(() => {
      titleLayer = drawCloudTitle();
      if (reducedMotion) drawIntroFrame(context, titleLayer, 0);
    });

    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  return <canvas ref={canvasRef} className="title-cloud-scene" aria-hidden="true" />;
}

function drawIntroFrame(
  context: CanvasRenderingContext2D,
  titleLayer: HTMLCanvasElement,
  time: number,
) {
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = SKY;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  for (const flight of FLIGHTS) {
    const progress = flightProgress(time, flight.delay);
    if (progress === null) continue;
    drawLoopingGamePlane(context, flight, progress, time);
  }

  context.drawImage(titleLayer, 0, 0);
}

function drawCloudTitle() {
  const layer = document.createElement("canvas");
  layer.width = WIDTH;
  layer.height = HEIGHT;
  const context = layer.getContext("2d");
  if (!context) return layer;

  const mask = document.createElement("canvas");
  mask.width = WIDTH / MASK_SCALE;
  mask.height = HEIGHT / MASK_SCALE;
  const maskContext = mask.getContext("2d", { willReadFrequently: true });
  if (!maskContext) return layer;
  maskContext.font = '22px "SkyWarsPixel"';
  maskContext.fillStyle = WHITE;
  maskContext.textAlign = "center";
  maskContext.textBaseline = "alphabetic";
  maskContext.fillText("SKY WARS", mask.width / 2, 47);

  const image = maskContext.getImageData(0, 0, mask.width, mask.height);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      const alpha = image.data[(y * mask.width + x) * 4 + 3];
      if (alpha > 80) {
        drawGameCloud(context, x * MASK_SCALE - 4, y * MASK_SCALE - 3, 0.1);
      }
    }
  }

  context.font = '22px "SkyWarsPixel"';
  context.fillStyle = WHITE;
  context.textAlign = "center";
  context.fillText("2-6 PILOTS", WIDTH / 2, 237);
  return layer;
}

function flightProgress(time: number, delay: number) {
  const cycle = 15.3;
  const phase = ((time + delay) % cycle + cycle) % cycle / cycle;
  if (phase < 0.12 || phase > 0.42) return null;
  const progress = (phase - 0.12) / 0.3;
  return progress < 0.985 ? progress : null;
}

function cubicPoint(flight: CloudFlight, progress: number) {
  const inverse = 1 - progress;
  return {
    x:
      inverse * inverse * inverse * flight.anchor.x +
      3 * inverse * inverse * progress * flight.controlOne.x +
      3 * inverse * progress * progress * flight.controlTwo.x +
      progress * progress * progress * flight.anchor.x,
    y:
      inverse * inverse * inverse * flight.anchor.y +
      3 * inverse * inverse * progress * flight.controlOne.y +
      3 * inverse * progress * progress * flight.controlTwo.y +
      progress * progress * progress * flight.anchor.y,
  };
}

function cubicDirection(flight: CloudFlight, progress: number) {
  const inverse = 1 - progress;
  const x =
    3 * inverse * inverse * (flight.controlOne.x - flight.anchor.x) +
    6 * inverse * progress * (flight.controlTwo.x - flight.controlOne.x) +
    3 * progress * progress * (flight.anchor.x - flight.controlTwo.x);
  const y =
    3 * inverse * inverse * (flight.controlOne.y - flight.anchor.y) +
    6 * inverse * progress * (flight.controlTwo.y - flight.controlOne.y) +
    3 * progress * progress * (flight.anchor.y - flight.controlTwo.y);
  return Math.atan2(y, x);
}

function drawLoopingGamePlane(
  context: CanvasRenderingContext2D,
  flight: CloudFlight,
  progress: number,
  time: number,
) {
  const point = cubicPoint(flight, progress);
  const angle = cubicDirection(flight, progress);
  context.save();
  context.translate(Math.round(point.x), Math.round(point.y));
  context.rotate(angle);
  context.scale(0.41, 0.41);
  drawGamePlaneSprite(context, flight.color, time);
  context.restore();
}
