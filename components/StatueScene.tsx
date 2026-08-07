"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function makeMarbleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#fff7e7");
  gradient.addColorStop(0.45, "#d8cbb5");
  gradient.addColorStop(1, "#f3eadb");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 120; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const length = 160 + Math.random() * 460;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + Math.random() * 120 - 60,
      y + length * 0.3,
      x + Math.random() * 180 - 90,
      y + length * 0.7,
      x + Math.random() * 240 - 120,
      y + length
    );
    ctx.strokeStyle = `rgba(${120 + Math.random() * 40}, ${107 + Math.random() * 28}, ${86 + Math.random() * 28}, ${0.05 + Math.random() * 0.08})`;
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function addCurl(group: THREE.Group, material: THREE.Material, x: number, y: number, z: number, scale: number) {
  const curl = new THREE.Mesh(new THREE.IcosahedronGeometry(scale, 2), material);
  curl.position.set(x, y, z);
  curl.rotation.set(Math.random() * 0.4, Math.random() * 0.4, Math.random() * 0.4);
  group.add(curl);
}

function buildBust() {
  const bust = new THREE.Group();
  const marbleMap = makeMarbleTexture();
  const marble = new THREE.MeshPhysicalMaterial({
    color: "#f2ead8",
    map: marbleMap ?? undefined,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.28
  });
  const shadowMarble = new THREE.MeshPhysicalMaterial({
    color: "#d2c3aa",
    map: marbleMap ?? undefined,
    roughness: 0.54,
    metalness: 0,
    clearcoat: 0.18
  });
  const bronze = new THREE.MeshStandardMaterial({
    color: "#a87932",
    roughness: 0.32,
    metalness: 0.72
  });

  const shoulders = new THREE.Mesh(
    new THREE.CylinderGeometry(1.65, 2.45, 1.1, 72, 1, false),
    shadowMarble
  );
  shoulders.position.y = -1.35;
  shoulders.scale.z = 0.48;
  bust.add(shoulders);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(1.72, 72, 32), shadowMarble);
  chest.position.set(0, -0.95, 0);
  chest.scale.set(1.25, 0.55, 0.42);
  bust.add(chest);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.56, 0.88, 48), marble);
  neck.position.y = -0.45;
  bust.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.82, 72, 72), marble);
  head.position.y = 0.62;
  head.scale.set(0.82, 1.12, 0.72);
  bust.add(head);

  const brow = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 12, 64, Math.PI), bronze);
  brow.position.set(0, 0.95, 0.08);
  brow.rotation.set(Math.PI * 0.55, 0, 0);
  bust.add(brow);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 24), marble);
  nose.position.set(0, 0.58, 0.62);
  nose.rotation.x = Math.PI * 0.48;
  bust.add(nose);

  const beard = new THREE.Group();
  const beardPositions = [
    [-0.42, 0.13, 0.53],
    [-0.24, 0.03, 0.62],
    [0, -0.02, 0.66],
    [0.24, 0.03, 0.62],
    [0.42, 0.13, 0.53],
    [-0.28, -0.18, 0.5],
    [0, -0.25, 0.56],
    [0.28, -0.18, 0.5]
  ];
  beardPositions.forEach(([x, y, z], index) => addCurl(beard, shadowMarble, x, y, z, index === 6 ? 0.2 : 0.16));
  bust.add(beard);

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 1.35 + Math.PI * 0.82;
    addCurl(
      bust,
      shadowMarble,
      Math.cos(angle) * 0.68,
      0.78 + Math.sin(i * 1.7) * 0.14,
      Math.sin(angle) * 0.42,
      0.13 + (i % 3) * 0.018
    );
  }

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.75, 0.28, 72), bronze);
  plinth.position.y = -2.05;
  bust.add(plinth);

  bust.position.set(0, -0.1, 0);
  bust.rotation.y = -0.34;
  return bust;
}

export function StatueScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.dataset.testid = "statue-canvas";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.24, 6.2);

    const bust = buildBust();
    scene.add(bust);

    const key = new THREE.DirectionalLight("#fff2d4", 3.6);
    key.position.set(3.2, 4.5, 3.4);
    scene.add(key);

    const rim = new THREE.DirectionalLight("#b68b43", 2.1);
    rim.position.set(-4, 2, -2.5);
    scene.add(rim);

    const fill = new THREE.HemisphereLight("#f8efe0", "#27150d", 2.2);
    scene.add(fill);

    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
      pointer.y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    };
    host.addEventListener("pointermove", onPointerMove);

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      const mobile = width < 760;
      bust.scale.setScalar(mobile ? 0.92 : 1.1);
      bust.position.x = mobile ? 0 : -0.62;
      bust.position.y = mobile ? -0.22 : -0.05;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    const render = (time: number) => {
      bust.rotation.y = -0.38 + Math.sin(time * 0.00035) * 0.12 + pointer.x * 0.06;
      bust.rotation.x = pointer.y * 0.025;
      frame = requestAnimationFrame(render);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeChild(renderer.domElement);
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
    };
  }, []);

  return <div ref={hostRef} className="statueScene" aria-hidden="true" />;
}
