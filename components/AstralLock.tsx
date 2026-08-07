"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const cx = 270;
const cy = 270;
const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const numeralRadii = [92, 150, 208];
const bands = [
  [58, 121],
  [121, 179],
  [179, 238]
];
const solution = [10, 6, 4]; // inner, middle, outer. Readout is outer IV, middle VI, inner X.
const word = "AZOTH";
const initialRotations = [60, 180, 300];

type ActiveDrag = {
  ring: number;
  startAngle: number;
  startRotation: number;
  lastTop: number;
};

function point(radius: number, degrees: number) {
  const angle = (degrees * Math.PI) / 180;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)] as const;
}

function normalizeRotation(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

function topNumeral(rotation: number) {
  let best = 1;
  let bestDistance = 999;

  for (let numeral = 1; numeral <= 12; numeral += 1) {
    const angle = normalizeRotation(-90 + (numeral - 1) * 30 + rotation);
    const distance = Math.min(Math.abs(angle - 270), 360 - Math.abs(angle - 270));
    if (distance < bestDistance) {
      best = numeral;
      bestDistance = distance;
    }
  }

  return best;
}

function ringAt(distance: number) {
  if (distance >= bands[0][0] - 8 && distance <= bands[0][1]) return 0;
  if (distance > bands[1][0] && distance <= bands[1][1]) return 1;
  if (distance > bands[2][0] && distance <= bands[2][1] + 8) return 2;
  return -1;
}

function randomRotation() {
  return Math.floor(Math.random() * 12) * 30;
}

function svgAngle(svg: SVGSVGElement, clientX: number, clientY: number) {
  const bounds = svg.getBoundingClientRect();
  const x = (clientX - bounds.left) * (540 / bounds.width);
  const y = (clientY - bounds.top) * (540 / bounds.height);
  return {
    angle: (Math.atan2(y - cy, x - cx) * 180) / Math.PI,
    distance: Math.hypot(x - cx, y - cy)
  };
}

function getAudioContext(existing: AudioContext | null) {
  if (existing) return existing;
  const AudioContextCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return AudioContextCtor ? new AudioContextCtor() : null;
}

export function AstralLock({ onSpeak }: { onSpeak: (word: string) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const activeRef = useRef<ActiveDrag | null>(null);
  const rotationRef = useRef(initialRotations);
  const audioRef = useRef<AudioContext | null>(null);
  const [rotations, setRotations] = useState(initialRotations);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [message, setMessage] = useState("");
  const [solved, setSolved] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [dragging, setDragging] = useState(false);

  const selected = rotations.map(topNumeral);
  const combo = `${roman[selected[2]]}-${roman[selected[1]]}-${roman[selected[0]]}`;

  const tone = useCallback((type: OscillatorType, frequency: number, duration: number, volume: number, delay = 0) => {
    if (!soundEnabled) return;
    const audio = getAudioContext(audioRef.current);
    audioRef.current = audio;
    if (!audio) return;
    void audio.resume();

    const start = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }, [soundEnabled]);

  const tick = useCallback(() => {
    tone("triangle", 980, 0.045, 0.025);
  }, [tone]);

  const settle = useCallback(() => {
    tone("sine", 420, 0.14, 0.045);
    tone("triangle", 840, 0.1, 0.025, 0.025);
  }, [tone]);

  function wrong() {
    tone("sine", 92, 0.22, 0.08);
    tone("triangle", 68, 0.18, 0.035, 0.03);
  }

  function success() {
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      tone(index < 3 ? "sine" : "triangle", frequency, 0.72, 0.08 / (index * 0.25 + 1), index * 0.14);
    });
  }

  useEffect(() => {
    rotationRef.current = rotations;
  }, [rotations]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = activeRef.current;
      const svg = svgRef.current;
      if (!active || !svg || solved) return;

      const { angle } = svgAngle(svg, event.clientX, event.clientY);
      const next = [...rotationRef.current];
      next[active.ring] = active.startRotation + (angle - active.startAngle);
      const currentTop = topNumeral(next[active.ring]);

      if (currentTop !== active.lastTop) {
        active.lastTop = currentTop;
        tick();
      }

      setRotations(next);
      event.preventDefault();
    };

    const up = () => {
      const active = activeRef.current;
      if (!active) return;

      setRotations((current) => {
        const next = [...current];
        next[active.ring] = Math.round(next[active.ring] / 30) * 30;
        return next;
      });
      settle();
      setDragging(false);
      activeRef.current = null;
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [settle, solved, tick]);

  function startDrag(event: React.PointerEvent<SVGSVGElement>) {
    if (solved || !svgRef.current) return;

    const { angle, distance } = svgAngle(svgRef.current, event.clientX, event.clientY);
    const ring = ringAt(distance);
    if (ring < 0) return;

    activeRef.current = {
      ring,
      startAngle: angle,
      startRotation: rotationRef.current[ring],
      lastTop: topNumeral(rotationRef.current[ring])
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function disturb() {
    const next = [randomRotation(), randomRotation(), randomRotation()];
    rotationRef.current = next;
    setRotations(next);
    setWrongAttempts(0);
    setMessage("");
    setSolved(false);
  }

  function tryLock() {
    if (selected.every((value, index) => value === solution[index])) {
      setSolved(true);
      setMessage("");
      success();
      return;
    }

    wrong();
    setWrongAttempts((current) => current + 1);
    setMessage(
      wrongAttempts >= 2
        ? "The lock holds fast. Mind the wheel each stanza names; cast upon the twelve means take the remainder."
        : "The lock holds fast. Reckon again."
    );
  }

  return (
    <div className="astralLock">
      <div className="lockTopline">
        <p>
          Current order: <b>{combo}</b>
        </p>
        <button
          className={soundEnabled ? "soundToggle on" : "soundToggle"}
          type="button"
          onClick={() => setSoundEnabled((enabled) => !enabled)}
        >
          Sound {soundEnabled ? "on" : "off"}
        </button>
      </div>

      <svg
        ref={svgRef}
        className={solved ? "lockSvg solved" : "lockSvg"}
        viewBox="0 0 540 540"
        aria-label="Three numbered philosopher's lock dials"
        onPointerDown={startDrag}
      >
        {[0, 1, 2].map((ring) => {
          const [inner, outer] = bands[ring];
          const radius = (inner + outer) / 2;
          return (
            <g key={`band-${ring}`}>
              <circle cx="270" cy="270" r={radius} className="dialWash" strokeWidth={outer - inner} />
              <circle cx="270" cy="270" r={outer} className="dialBand" />
            </g>
          );
        })}
        {Array.from({ length: 12 }, (_, index) => {
          const angle = -90 + index * 30;
          const [x1, y1] = point(238, angle);
          const [x2, y2] = point(228, angle);
          return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} className="dialTick" />;
        })}

        {[2, 1, 0].map((ring) => (
          <g key={ring} transform={`rotate(${rotations[ring]} 270 270)`}>
            {Array.from({ length: 12 }, (_, index) => {
              const numeral = index + 1;
              const angle = -90 + index * 30;
              const [x, y] = point(numeralRadii[ring], angle);
              const active = selected[ring] === numeral;
              return (
                <text
                  key={numeral}
                  x={x}
                  y={y}
                  className={active ? "dialNumber selected" : "dialNumber"}
                >
                  {roman[numeral]}
                </text>
              );
            })}
          </g>
        ))}

        <circle cx="270" cy="270" r="48" className={dragging ? "hubGlow visible" : "hubGlow"} />
        <circle cx="270" cy="270" r="28" className="hubDisc" />
        <circle cx="270" cy="270" r="5" className="hubCore" />
        <polygon points="270,18 278,40 262,40" className="pointerMark" />
        <text x="270" y="262" className="readHere">
          read here
        </text>
      </svg>

      <div className="dialReadout">
        <span>
          Outer <b>{roman[selected[2]]}</b>
        </span>
        <span>
          Middle <b>{roman[selected[1]]}</b>
        </span>
        <span>
          Inner <b>{roman[selected[0]]}</b>
        </span>
      </div>

      <div className="lockControls">
        <button className="btn" type="button" onClick={tryLock}>
          Try the lock
        </button>
        <button className="btn" type="button" onClick={disturb}>
          Disturb the wheels
        </button>
      </div>

      {message ? <p className="warningText lockMessage">{message}</p> : null}

      {solved ? (
        <div className="revealWord">
          <p>The tumblers fall. The Word burns through.</p>
          <strong>{word}</strong>
          <button className="btn" type="button" onClick={() => onSpeak(word)}>
            Speak it now
          </button>
        </div>
      ) : (
        <p className="lockHint">Drag the wheels into place. Set the dials from the Tabula, then test the mechanism.</p>
      )}
    </div>
  );
}
