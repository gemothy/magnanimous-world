"use client";

import { useEffect, useRef } from "react";
import type { SceneTheme } from "@/lib/cast-config";

type AmbientCanvasProps = {
  active: boolean;
  still: boolean;
  theme: SceneTheme;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bornAt: number;
  life: number;
  radius: number;
  phase: number;
};

type WaterGlint = {
  x: number;
  y: number;
  length: number;
  phase: number;
  speed: number;
  alpha: number;
};

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

function createGlowSprite() {
  const sprite = document.createElement("canvas");
  sprite.width = 64;
  sprite.height = 64;
  const context = sprite.getContext("2d");
  if (!context) return sprite;
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "rgba(255, 236, 177, 0.98)");
  glow.addColorStop(0.12, "rgba(255, 187, 83, 0.78)");
  glow.addColorStop(0.38, "rgba(242, 136, 46, 0.26)");
  glow.addColorStop(1, "rgba(242, 136, 46, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
  return sprite;
}

export function AmbientCanvas({
  active,
  still,
  theme
}: AmbientCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atmosphereRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const atmosphere = atmosphereRef.current;
    if (!canvas || !atmosphere) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let previous = performance.now();
    let lastDraw = 0;
    let nextFirefly = previous + randomBetween(350, 1400);
    let nextEmber = previous + randomBetween(80, 260);
    let nextMeteor = previous + randomBetween(150_000, 360_000);
    let meteor: { startedAt: number; x: number; y: number } | null = null;
    const fireflies: Particle[] = [];
    const embers: Particle[] = [];
    const glowSprite = createGlowSprite();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const waterGlints: WaterGlint[] = Array.from({ length: 58 }, (_, index) => {
      const depth = (index + Math.random()) / 58;
      return {
        x: randomBetween(0.38, 0.84),
        y: 0.505 + depth * 0.205,
        length: randomBetween(0.008, 0.032) * (0.62 + depth * 1.25),
        phase: randomBetween(0, Math.PI * 2),
        speed: randomBetween(0.28, 0.74),
        alpha: randomBetween(0.055, 0.18)
      };
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const longEdge = Math.max(rect.width, rect.height);
      const ratio = Math.max(0.7, Math.min(pixelRatio, 1.25, 2200 / Math.max(1, longEdge)));
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const drawWater = (width: number, height: number, t: number) => {
      context.save();
      context.beginPath();
      context.moveTo(width * 0.39, height * 0.485);
      context.lineTo(width * 0.865, height * 0.485);
      context.lineTo(width * 0.88, height * 0.69);
      context.lineTo(width * 0.33, height * 0.71);
      context.closePath();
      context.clip();
      context.globalCompositeOperation = "screen";
      context.lineCap = "round";
      const waterColor = context.createLinearGradient(
        width * 0.34,
        0,
        width * 0.88,
        0
      );
      waterColor.addColorStop(
        0,
        theme === "day" ? "rgba(168, 231, 226, 0.36)" : "rgba(112, 203, 201, 0.42)"
      );
      waterColor.addColorStop(
        0.62,
        theme === "day" ? "rgba(244, 250, 232, 0.74)" : "rgba(210, 239, 228, 0.92)"
      );
      waterColor.addColorStop(
        1,
        theme === "day" ? "rgba(102, 207, 202, 0.26)" : "rgba(105, 197, 198, 0.32)"
      );
      context.strokeStyle = waterColor;

      const reflectionPulse = 0.7 + Math.sin(t * 0.31) * 0.12 + Math.sin(t * 0.19 + 1.7) * 0.08;
      for (const glint of waterGlints) {
        const sway =
          Math.sin(t * glint.speed + glint.phase) * width * 0.008 +
          Math.sin(t * 0.17 + glint.phase * 1.7) * width * 0.005;
        const x = glint.x * width + sway;
        const y =
          glint.y * height +
          Math.sin(t * (glint.speed * 0.73) + glint.phase) * height * 0.0026;
        const lineWidth = Math.max(0.6, (glint.y - 0.47) * 8);
        const length =
          glint.length * width * (0.74 + Math.sin(t * glint.speed * 1.6 + glint.phase) * 0.24);
        const moonProximity = Math.max(0, 1 - Math.abs(glint.x - 0.7) * 3.4);
        const alpha = glint.alpha * reflectionPulse * (0.58 + moonProximity * 0.8);
        context.globalAlpha = alpha;
        context.lineWidth = lineWidth;
        context.beginPath();
        context.moveTo(x - length, y);
        context.quadraticCurveTo(
          x,
          y + Math.sin(t * 0.63 + glint.phase) * 1.2,
          x + length,
          y
        );
        context.stroke();
      }
      context.globalAlpha = 1;

      const reflectionPath = context.createRadialGradient(
        width * 0.7,
        height * 0.54,
        0,
        width * 0.7,
        height * 0.59,
        width * 0.16
      );
      reflectionPath.addColorStop(
        0,
        theme === "day"
          ? `rgba(244, 249, 225, ${0.038 + Math.sin(t * 0.23) * 0.008})`
          : `rgba(173, 228, 225, ${0.055 + Math.sin(t * 0.23) * 0.012})`
      );
      reflectionPath.addColorStop(
        0.42,
        theme === "day" ? "rgba(126, 214, 207, 0.018)" : "rgba(87, 180, 182, 0.025)"
      );
      reflectionPath.addColorStop(
        1,
        theme === "day" ? "rgba(73, 166, 160, 0)" : "rgba(45, 118, 123, 0)"
      );
      context.fillStyle = reflectionPath;
      context.fillRect(width * 0.43, height * 0.47, width * 0.52, height * 0.3);
      context.restore();
    };

    const drawParticles = (
      particles: Particle[],
      now: number,
      t: number,
      delta: number,
      isEmber: boolean,
      alphaScale = 1
    ) => {
      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        const age = now - particle.bornAt;
        if (age >= particle.life) {
          particles.splice(index, 1);
          continue;
        }
        particle.vx += Math.sin(t * 0.78 + particle.phase) * delta * (isEmber ? 2.4 : 1.5);
        particle.vy += Math.cos(t * 0.49 + particle.phase) * delta * (isEmber ? 0.35 : 0.8);
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        const envelope = Math.sin(Math.min(1, age / particle.life) * Math.PI);
        const flicker = 0.65 + Math.sin(t * (isEmber ? 8.2 : 2.1) + particle.phase) * 0.26;
        const alpha = Math.max(
          0,
          envelope * flicker * (isEmber ? 0.8 : 0.66) * alphaScale
        );
        const size = particle.radius * (isEmber ? 12 : 15);
        context.save();
        context.globalAlpha = alpha;
        context.drawImage(glowSprite, particle.x - size / 2, particle.y - size / 2, size, size);
        context.restore();
      }
    };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden || now - lastDraw < 32) return;
      lastDraw = now;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);

      const motionStopped = still || reducedMotion.matches;
      const t = now / 1000;
      const delta = Math.min(0.05, (now - previous) / 1000);
      previous = now;

      if (!motionStopped) {
        const fire =
          0.96 +
          Math.sin(t * 4.7) * 0.075 +
          Math.sin(t * 7.9 + 0.9) * 0.046 +
          Math.sin(t * 2.3 + 2.2) * 0.038;
        atmosphere.style.setProperty("--fire-strength", fire.toFixed(3));
        atmosphere.style.setProperty("--mist-x", `${(Math.sin(t / 13.7) * 5.2).toFixed(2)}%`);
        atmosphere.style.setProperty("--mist-y", `${(Math.cos(t / 21.3) * 1.55).toFixed(2)}%`);
        atmosphere.style.setProperty(
          "--leaf-left-x",
          `${(Math.sin(t / 5.1) * 0.38 + Math.sin(t / 9.7) * 0.2).toFixed(3)}%`
        );
        atmosphere.style.setProperty(
          "--leaf-left-r",
          `${(Math.sin(t / 4.4) * 0.22 + Math.sin(t / 8.9) * 0.13).toFixed(3)}deg`
        );
        atmosphere.style.setProperty(
          "--leaf-right-x",
          `${(Math.cos(t / 6.2) * 0.31 + Math.sin(t / 11.4) * 0.17).toFixed(3)}%`
        );
        atmosphere.style.setProperty(
          "--leaf-right-r",
          `${(Math.sin(t / 5.7 + 1.1) * 0.2 + Math.cos(t / 10.8) * 0.11).toFixed(3)}deg`
        );
        atmosphere.style.setProperty("--cloud-x", `${(Math.sin(t / 34.1) * 4.8).toFixed(2)}%`);

        drawWater(width, height, t);
      } else {
        atmosphere.style.setProperty("--fire-strength", "0.96");
        atmosphere.style.setProperty("--mist-x", "0%");
        atmosphere.style.setProperty("--mist-y", "0%");
        atmosphere.style.setProperty("--leaf-left-x", "0%");
        atmosphere.style.setProperty("--leaf-left-r", "0deg");
        atmosphere.style.setProperty("--leaf-right-x", "0%");
        atmosphere.style.setProperty("--leaf-right-r", "0deg");
        atmosphere.style.setProperty("--cloud-x", "0%");
      }

      const portrait = height > width * 1.12;

      if (
        theme === "night" &&
        !motionStopped &&
        active &&
        now >= nextFirefly &&
        fireflies.length < 12
      ) {
        const leftSide = Math.random() > 0.42;
        fireflies.push({
          x: leftSide
            ? randomBetween(width * 0.06, width * 0.43)
            : randomBetween(width * 0.73, width * 0.96),
          y: randomBetween(height * 0.34, height * 0.73),
          vx: randomBetween(-2.8, 2.8),
          vy: randomBetween(-4.7, -0.5),
          bornAt: now,
          life: randomBetween(5500, 13_000),
          radius: randomBetween(1.25, 2.8),
          phase: randomBetween(0, Math.PI * 2)
        });
        nextFirefly = now + randomBetween(1000, 5200);
      }

      if (!motionStopped && active && !portrait && now >= nextEmber && embers.length < 18) {
        embers.push({
          x: randomBetween(width * 0.275, width * 0.32),
          y: randomBetween(height * 0.645, height * 0.69),
          vx: randomBetween(-8, 8),
          vy: randomBetween(-31, -13),
          bornAt: now,
          life: randomBetween(1100, 3100),
          radius: randomBetween(0.75, 1.7),
          phase: randomBetween(0, Math.PI * 2)
        });
        nextEmber = now + randomBetween(90, 420);
      }

      if (!motionStopped) {
        drawParticles(fireflies, now, t, delta, false);
        drawParticles(embers, now, t, delta, true, theme === "day" ? 0.34 : 1);
      } else {
        fireflies.length = 0;
        embers.length = 0;
      }

      if (
        theme === "night" &&
        !motionStopped &&
        active &&
        now >= nextMeteor &&
        !meteor
      ) {
        meteor = {
          startedAt: now,
          x: randomBetween(width * 0.48, width * 0.78),
          y: height * 0.12
        };
        nextMeteor = now + randomBetween(180_000, 420_000);
      }
      if (meteor) {
        const progress = (now - meteor.startedAt) / 1300;
        if (progress >= 1 || motionStopped) {
          meteor = null;
        } else {
          const alpha = Math.sin(progress * Math.PI) * 0.45;
          const x = meteor.x + progress * width * 0.07;
          const y = meteor.y + progress * height * 0.055;
          const gradient = context.createLinearGradient(x - 60, y - 32, x, y);
          gradient.addColorStop(0, "rgba(228, 242, 239, 0)");
          gradient.addColorStop(1, `rgba(228, 242, 239, ${alpha})`);
          context.strokeStyle = gradient;
          context.lineWidth = 1;
          context.beginPath();
          context.moveTo(x - 60, y - 32);
          context.lineTo(x, y);
          context.stroke();
        }
      }
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [active, still, theme]);

  return (
    <>
      <div ref={atmosphereRef} className="atmosphere" aria-hidden="true">
        <span className="cloudVeil" />
        <span className="waterShimmer waterShimmerOne" />
        <span className="waterShimmer waterShimmerTwo" />
        <span className="fireBloom" />
        <span className="fireBounce fireBounceOne" />
        <span className="fireBounce fireBounceTwo" />
        <span className="fireBounce fireBounceThree" />
        <span className="mist mistOne" />
        <span className="mist mistTwo" />
      </div>
      <canvas ref={canvasRef} className="ambientCanvas" aria-hidden="true" />
    </>
  );
}
