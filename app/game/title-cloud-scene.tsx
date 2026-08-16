"use client";

import { useEffect, useRef } from "react";

const WIDTH = 768;
const HEIGHT = 512;
const PIXEL = 4;
const SKY = "#9b90f4";
const WHITE = "#fffdf8";
const BLACK = "#17131f";

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
    controlOne: { x: 42, y: 216 },
    controlTwo: { x: 96, y: 382 },
    color: "#f02b10",
    delay: 0,
  },
  {
    anchor: { x: 438, y: 142 },
    controlOne: { x: 632, y: 54 },
    controlTwo: { x: 716, y: 286 },
    color: "#00ad38",
    delay: 5.1,
  },
  {
    anchor: { x: 622, y: 150 },
    controlOne: { x: 728, y: 252 },
    controlTwo: { x: 520, y: 432 },
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

  return (
    <canvas
      ref={canvasRef}
      className="title-cloud-scene"
      aria-hidden="true"
    />
  );
}

function drawIntroFrame(
  context: CanvasRenderingContext2D,
  titleLayer: HTMLCanvasElement,
  time: number,
) {
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = SKY;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  drawDepthClouds(context, time);
  context.drawImage(titleLayer, 0, 0);

  for (const flight of FLIGHTS) {
    const progress = flightProgress(time, flight.delay);
    if (progress === null) continue;
    drawCloudOpening(context, flight.anchor, progress);
    drawPlaneTrail(context, flight, progress);
    drawLoopingPlane(context, flight, progress);
  }
}

function drawCloudTitle() {
  const layer = document.createElement("canvas");
  layer.width = WIDTH;
  layer.height = HEIGHT;
  const context = layer.getContext("2d");
  if (!context) return layer;

  const mask = document.createElement("canvas");
  mask.width = WIDTH / PIXEL;
  mask.height = HEIGHT / PIXEL;
  const maskContext = mask.getContext("2d", { willReadFrequently: true });
  if (!maskContext) return layer;
  maskContext.font = '22px "SkyWarsPixel"';
  maskContext.fillStyle = WHITE;
  maskContext.textAlign = "center";
  maskContext.textBaseline = "alphabetic";
  maskContext.fillText("SKY WARS", mask.width / 2, 47);

  const image = maskContext.getImageData(0, 0, mask.width, mask.height);
  const filled = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return false;
    return image.data[(y * mask.width + x) * 4 + 3] > 80;
  };

  context.globalAlpha = 0.24;
  context.fillStyle = BLACK;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (filled(x, y)) context.fillRect(x * PIXEL + 7, y * PIXEL + 9, PIXEL, PIXEL);
    }
  }

  context.globalAlpha = 1;
  context.fillStyle = WHITE;
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!filled(x, y)) continue;
      context.fillRect(x * PIXEL, y * PIXEL, PIXEL, PIXEL);
      const edge = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
      if (edge && cloudHash(x, y) % 11 === 0) {
        const puff = 4 + (cloudHash(y, x) % 3) * 4;
        context.fillRect(x * PIXEL - puff / 2, y * PIXEL - puff / 2, puff, puff);
      }
    }
  }

  context.font = '22px "SkyWarsPixel"';
  context.fillStyle = WHITE;
  context.textAlign = "center";
  context.fillText("2-6 PILOTS", WIDTH / 2, 237);
  return layer;
}

function drawDepthClouds(context: CanvasRenderingContext2D, time: number) {
  const distantDrift = (time * 3) % (WIDTH + 260);
  const nearDrift = (time * 7) % (WIDTH + 360);

  context.save();
  context.globalAlpha = 0.1;
  drawPixelCloud(context, WIDTH - distantDrift, 310, 0.75, WHITE);
  drawPixelCloud(context, 330 - distantDrift, 390, 0.5, WHITE);
  context.globalAlpha = 0.08;
  drawPixelCloud(context, -170 + nearDrift, 430, 1.4, BLACK);
  drawPixelCloud(context, 620 - nearDrift, 360, 1.05, BLACK);
  context.restore();
}

function drawPixelCloud(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  color: string,
) {
  const unit = 8 * scale;
  context.fillStyle = color;
  context.fillRect(Math.round(x), Math.round(y), Math.round(unit * 9), Math.round(unit * 3));
  context.fillRect(Math.round(x + unit), Math.round(y - unit), Math.round(unit * 3), Math.round(unit));
  context.fillRect(Math.round(x + unit * 4), Math.round(y - unit * 2), Math.round(unit * 3), Math.round(unit * 2));
  context.fillRect(Math.round(x + unit * 7), Math.round(y - unit), Math.round(unit), Math.round(unit));
  context.fillRect(Math.round(x + unit * 2), Math.round(y + unit * 3), Math.round(unit * 5), Math.round(unit));
}

function flightProgress(time: number, delay: number) {
  const cycle = 15.3;
  const phase = ((time + delay) % cycle + cycle) % cycle / cycle;
  if (phase < 0.12 || phase > 0.42) return null;
  return smoothStep((phase - 0.12) / 0.3);
}

function smoothStep(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
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

function drawCloudOpening(context: CanvasRenderingContext2D, anchor: Point, progress: number) {
  const open = Math.sin(Math.PI * progress);
  const size = Math.round(4 + open * 11) / 2 * 2;
  context.fillStyle = SKY;
  context.fillRect(Math.round(anchor.x - size), Math.round(anchor.y - size / 2), size * 2, size);
  if (open > 0.55) {
    context.fillRect(Math.round(anchor.x - size / 2), Math.round(anchor.y - size), size, size * 2);
  }
}

function drawPlaneTrail(
  context: CanvasRenderingContext2D,
  flight: CloudFlight,
  progress: number,
) {
  context.save();
  context.fillStyle = WHITE;
  for (let index = 1; index <= 7; index += 1) {
    const trailProgress = Math.max(0, progress - index * 0.018);
    const point = cubicPoint(flight, trailProgress);
    context.globalAlpha = 0.42 - index * 0.045;
    const size = index % 3 === 0 ? 4 : 3;
    context.fillRect(Math.round(point.x), Math.round(point.y), size, size);
  }
  context.restore();
}

function drawLoopingPlane(
  context: CanvasRenderingContext2D,
  flight: CloudFlight,
  progress: number,
) {
  const point = cubicPoint(flight, progress);
  const direction = cubicDirection(flight, progress);
  const angle = Math.round(direction / (Math.PI / 12)) * (Math.PI / 12);
  const depth = 0.62 + Math.sin(Math.PI * progress) * 0.9;

  context.save();
  context.translate(Math.round(point.x + 5), Math.round(point.y + 7));
  context.rotate(angle);
  context.scale(depth, depth);
  context.globalAlpha = 0.24;
  drawPlaneShape(context, BLACK, false);
  context.restore();

  context.save();
  context.translate(Math.round(point.x), Math.round(point.y));
  context.rotate(angle);
  context.scale(depth, depth);
  drawPlaneShape(context, flight.color);
  context.restore();
}

function drawPlaneShape(context: CanvasRenderingContext2D, color: string, drawCockpit = true) {
  context.fillStyle = color;
  context.fillRect(-12, -2, 24, 4);
  context.fillRect(-8, -8, 17, 3);
  context.fillRect(-6, -5, 15, 8);
  context.fillRect(-12, -6, 4, 8);
  context.fillRect(8, -1, 7, 2);
  if (drawCockpit) {
    context.fillStyle = WHITE;
    context.fillRect(2, -4, 3, 3);
  }
}

function cloudHash(x: number, y: number) {
  return Math.abs((x * 73856093) ^ (y * 19349663));
}
