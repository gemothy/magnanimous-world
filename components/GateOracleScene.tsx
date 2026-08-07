"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function makeSand(count: number) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.15 + Math.random() * 1.8;
    const height = (Math.random() - 0.5) * 3.1;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = height;
    positions[i * 3 + 2] = Math.sin(angle) * radius * 0.42 - 0.35;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
  return geometry;
}

export function GateOracleScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.dataset.testid = "gate-oracle-canvas";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0.2, 8.2);

    const oracle = new THREE.Group();
    scene.add(oracle);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.62, 96, 96),
      new THREE.MeshPhysicalMaterial({
        color: "#050403",
        emissive: "#2a1908",
        emissiveIntensity: 0.36,
        metalness: 0.32,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.12
      })
    );
    oracle.add(sphere);

    const innerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(1.34, 96, 48),
      new THREE.MeshBasicMaterial({
        color: "#d8a944",
        transparent: true,
        opacity: 0.09,
        blending: THREE.AdditiveBlending
      })
    );
    oracle.add(innerGlow);

    const triangleShape = new THREE.Shape();
    triangleShape.moveTo(0, 0.62);
    triangleShape.lineTo(0.72, -0.5);
    triangleShape.lineTo(-0.72, -0.5);
    triangleShape.closePath();
    const triangle = new THREE.Mesh(
      new THREE.ShapeGeometry(triangleShape),
      new THREE.MeshBasicMaterial({
        color: "#e8cf86",
        transparent: true,
        opacity: 0.11,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      })
    );
    triangle.position.set(0, -0.02, 2.08);
    triangle.scale.setScalar(0.52);
    oracle.add(triangle);

    const rimMaterial = new THREE.MeshStandardMaterial({
      color: "#d0aa62",
      emissive: "#6d4e1d",
      emissiveIntensity: 0.5,
      metalness: 0.86,
      roughness: 0.24
    });

    const rings: THREE.Mesh[] = [];
    [
      { radius: 1.78, tube: 0.012, rotation: [Math.PI / 2, 0.16, 0], arc: Math.PI * 1.78 },
      { radius: 1.36, tube: 0.007, rotation: [Math.PI / 2.05, -0.42, 0.25], arc: Math.PI * 2 },
      { radius: 1.02, tube: 0.005, rotation: [Math.PI / 1.92, 0.48, -0.18], arc: Math.PI * 2 }
    ].forEach((ring) => {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(ring.radius, ring.tube, 12, 180, ring.arc), rimMaterial);
      mesh.rotation.set(ring.rotation[0], ring.rotation[1], ring.rotation[2]);
      rings.push(mesh);
      oracle.add(mesh);
    });

    const sandGeometry = makeSand(850);
    const sandMaterial = new THREE.PointsMaterial({
      color: "#e8cf86",
      size: 0.018,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const sand = new THREE.Points(sandGeometry, sandMaterial);
    oracle.add(sand);

    const floorGeometry = makeSand(320);
    const floorMaterial = new THREE.PointsMaterial({
      color: "#a87932",
      size: 0.014,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const floorSand = new THREE.Points(floorGeometry, floorMaterial);
    floorSand.position.y = -1.75;
    floorSand.scale.set(1.15, 0.12, 0.75);
    oracle.add(floorSand);

    scene.add(new THREE.HemisphereLight("#ffe8b0", "#130a04", 1.65));
    const key = new THREE.DirectionalLight("#ffe3a7", 2.4);
    key.position.set(4, 3, 5);
    scene.add(key);

    const rim = new THREE.DirectionalLight("#7a2330", 1.25);
    rim.position.set(-4, 1.2, -2);
    scene.add(rim);

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      const narrow = width < 680;
      oracle.scale.setScalar(narrow ? 0.82 : 1);
      oracle.position.y = narrow ? 0.35 : -0.04;
      oracle.position.z = narrow ? -0.15 : -0.35;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    const render = (time: number) => {
      const t = time * 0.001;
      oracle.rotation.y = Math.sin(t * 0.18) * 0.18;
      oracle.rotation.x = Math.sin(t * 0.13) * 0.035;
      sphere.rotation.y = t * 0.05;
      innerGlow.scale.setScalar(1 + Math.sin(t * 0.7) * 0.025);
      triangle.rotation.z = Math.sin(t * 0.34) * 0.035;
      sand.rotation.y = t * 0.08;
      sand.rotation.z = Math.sin(t * 0.2) * 0.018;
      floorSand.rotation.y = -t * 0.06;
      rings.forEach((ring, index) => {
        ring.rotation.z += 0.00045 * (index + 1);
      });
      frame = requestAnimationFrame(render);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeChild(renderer.domElement);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
    };
  }, []);

  return <div ref={hostRef} className="gateOracleScene" aria-hidden="true" />;
}
