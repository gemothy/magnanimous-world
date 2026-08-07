"use client";

import { useEffect, useRef } from "react";

export type VisualMode = "atmosphere" | "resonance" | "still";

type AudioVisualizerProps = {
  analyser: AnalyserNode | null;
  active: boolean;
  mode: VisualMode;
};

type ReflectionSeed = {
  x: number;
  y: number;
  phase: number;
  band: number;
  width: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function AudioVisualizer({ analyser, active, mode }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let lastDraw = 0;
    let bassEnvelope = 0;
    let midEnvelope = 0;
    let highEnvelope = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frequencies = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const reflections: ReflectionSeed[] = Array.from({ length: 34 }, (_, index) => ({
      x: 0.4 + Math.random() * 0.43,
      y: 0.515 + ((index + Math.random()) / 34) * 0.185,
      phase: Math.random() * Math.PI * 2,
      band: Math.floor(3 + Math.random() * 115),
      width: 0.006 + Math.random() * 0.022
    }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const longEdge = Math.max(rect.width, rect.height);
      const ratio = Math.max(
        0.65,
        Math.min(window.devicePixelRatio || 1, 1.2, 2100 / Math.max(1, longEdge))
      );
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const averageBand = (from: number, to: number) => {
      if (!frequencies) return 0;
      const end = Math.min(to, frequencies.length);
      let total = 0;
      for (let index = from; index < end; index += 1) total += frequencies[index];
      return total / Math.max(1, end - from) / 255;
    };

    const easeEnvelope = (current: number, target: number, attack: number, release: number) =>
      current + (target - current) * (target > current ? attack : release);

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden || now - lastDraw < 33) return;
      lastDraw = now;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);

      if (
        !analyser ||
        !frequencies ||
        !active ||
        mode === "still" ||
        reducedMotion.matches
      ) {
        return;
      }
      analyser.getByteFrequencyData(frequencies);

      const bassTarget = clamp01(Math.sqrt(averageBand(2, 24)) * 1.36);
      const midTarget = clamp01(Math.sqrt(averageBand(24, 112)) * 1.2);
      const highTarget = clamp01(Math.sqrt(averageBand(112, 250)) * 1.18);
      bassEnvelope = easeEnvelope(bassEnvelope, bassTarget, 0.22, 0.045);
      midEnvelope = easeEnvelope(midEnvelope, midTarget, 0.16, 0.04);
      highEnvelope = easeEnvelope(highEnvelope, highTarget, 0.32, 0.09);

      const strength = mode === "atmosphere" ? 0.42 : 1;
      const t = now / 1000;

      context.save();
      context.beginPath();
      context.moveTo(width * 0.39, height * 0.49);
      context.lineTo(width * 0.865, height * 0.49);
      context.lineTo(width * 0.875, height * 0.69);
      context.lineTo(width * 0.34, height * 0.705);
      context.closePath();
      context.clip();
      context.globalCompositeOperation = "screen";

      const lagoonGlow = context.createRadialGradient(
        width * 0.69,
        height * 0.56,
        0,
        width * 0.69,
        height * 0.6,
        width * 0.28
      );
      lagoonGlow.addColorStop(
        0,
        `rgba(106, 215, 211, ${(0.035 + bassEnvelope * 0.14) * strength})`
      );
      lagoonGlow.addColorStop(
        0.42,
        `rgba(42, 145, 150, ${(0.018 + bassEnvelope * 0.055) * strength})`
      );
      lagoonGlow.addColorStop(1, "rgba(21, 92, 99, 0)");
      context.fillStyle = lagoonGlow;
      context.fillRect(width * 0.36, height * 0.47, width * 0.58, height * 0.29);

      const reflectionColor = context.createLinearGradient(
        width * 0.36,
        0,
        width * 0.88,
        0
      );
      reflectionColor.addColorStop(0, "rgba(95, 188, 187, 0.3)");
      reflectionColor.addColorStop(0.58, "rgba(213, 239, 226, 0.96)");
      reflectionColor.addColorStop(1, "rgba(110, 202, 199, 0.24)");
      context.strokeStyle = reflectionColor;
      context.lineCap = "round";

      for (const seed of reflections) {
        const binEnergy = frequencies[Math.min(seed.band, frequencies.length - 1)] / 255;
        const response =
          (binEnergy * 0.46 + midEnvelope * 0.32 + highEnvelope * 0.22) * strength;
        const flicker = 0.72 + Math.sin(t * 0.74 + seed.phase) * 0.18;
        const x =
          seed.x * width +
          Math.sin(t * 0.39 + seed.phase) * width * 0.006;
        const y =
          seed.y * height +
          Math.cos(t * 0.28 + seed.phase) * height * 0.0018;
        const halfWidth = width * seed.width * (0.68 + response * 1.7);
        context.globalAlpha = clamp01((0.025 + response * 0.17) * flicker);
        context.lineWidth = 0.7 + (seed.y - 0.49) * 7;
        context.beginPath();
        context.moveTo(x - halfWidth, y);
        context.quadraticCurveTo(
          x,
          y + Math.sin(t * 0.9 + seed.phase) * 1.5,
          x + halfWidth,
          y
        );
        context.stroke();
      }
      context.restore();

      if (width > height * 1.1) {
        const fireResponse = (midEnvelope * 0.58 + highEnvelope * 0.42) * strength;
        const fireGlow = context.createRadialGradient(
          width * 0.295,
          height * 0.665,
          0,
          width * 0.295,
          height * 0.665,
          width * 0.19
        );
        fireGlow.addColorStop(
          0,
          `rgba(255, 170, 69, ${0.028 + fireResponse * 0.105})`
        );
        fireGlow.addColorStop(
          0.38,
          `rgba(220, 93, 28, ${0.014 + fireResponse * 0.044})`
        );
        fireGlow.addColorStop(1, "rgba(166, 54, 18, 0)");
        context.save();
        context.globalCompositeOperation = "screen";
        context.fillStyle = fireGlow;
        context.fillRect(0, height * 0.42, width * 0.5, height * 0.52);
        context.restore();
      }
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [active, analyser, mode]);

  return <canvas ref={canvasRef} className="visualizerCanvas" aria-hidden="true" />;
}
