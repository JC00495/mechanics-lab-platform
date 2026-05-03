import React, { useEffect, useMemo, useRef, useState } from 'react';

const VIEW_W = 800;
const VIEW_H = 360;
const G = 9.81;
/** 沿斜面位移与「展示米」换算：s 每增加 60 对应 1 m（与原先一致） */
const PX_PER_M = 60;
/** 斜面下端（沿斜面向下，s 增大） */
const TRACK_LEN = 420;
/**
 * 斜面上端延伸：s 可小于 0，物块可沿负方向上行至「山顶」再停下并下滑。
 * 约 7.5 m 额外上坡段（-450 / 60）
 */
const S_MIN = -450;
const ORIGIN_X = 150;
const ORIGIN_Y = 85;

/**
 * 斜面摩擦实验：公式步进 + 延长上坡 + 镜头跟随物块（世界坐标平移，HUD 固定）。
 */
const InclineFrictionScene = ({
  mass = 2,
  angleDeg = 30,
  frictionMu = 0.2,
  initialVelocityMps = 0,
  resetToken = 0,
  isRunning = false,
  onMetricsChange,
  onReachEnd,
}) => {
  const [sim, setSim] = useState({ s: 0, v: 0, t: 0 });
  const refSim = useRef(sim);
  const refRunning = useRef(isRunning);
  const rafRef = useRef(null);
  const prevTsRef = useRef(null);
  const reachedEndRef = useRef(false);
  const onMetricsChangeRef = useRef(onMetricsChange);
  const onReachEndRef = useRef(onReachEnd);

  useEffect(() => {
    onMetricsChangeRef.current = onMetricsChange;
  }, [onMetricsChange]);
  useEffect(() => {
    onReachEndRef.current = onReachEnd;
  }, [onReachEnd]);

  useEffect(() => {
    refRunning.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) prevTsRef.current = null;
  }, [isRunning]);

  const rad = (angleDeg * Math.PI) / 180;
  const accel = Math.max(0, G * (Math.sin(rad) - frictionMu * Math.cos(rad)));

  useEffect(() => {
    const reset = { s: 0, v: initialVelocityMps, t: 0 };
    refSim.current = reset;
    setSim(reset);
    reachedEndRef.current = false;
  }, [angleDeg, frictionMu, mass, resetToken]);

  useEffect(() => {
    const step = (ts) => {
      if (!prevTsRef.current) prevTsRef.current = ts;
      const dt = Math.min((ts - prevTsRef.current) / 1000, 0.03);
      prevTsRef.current = ts;

      if (refRunning.current) {
        if (reachedEndRef.current) {
          rafRef.current = requestAnimationFrame(step);
          return;
        }
        const cur = refSim.current;
        let nextV = cur.v + accel * dt;
        let rawNextS = cur.s + nextV * dt * PX_PER_M;

        if (rawNextS < S_MIN) {
          rawNextS = S_MIN;
          nextV = 0;
        }

        const reachedEnd = rawNextS >= TRACK_LEN;
        const next = {
          s: reachedEnd ? TRACK_LEN : rawNextS,
          v: reachedEnd ? 0 : nextV,
          t: cur.t + dt,
        };
        refSim.current = next;
        setSim(next);
        if (reachedEnd) {
          reachedEndRef.current = true;
          onReachEndRef.current?.(next);
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [accel]);

  const normalForce = mass * G * Math.cos(rad);
  const frictionForce = frictionMu * normalForce;
  const drivingForce = mass * G * Math.sin(rad);

  useEffect(() => {
    onMetricsChangeRef.current?.({
      acceleration: accel,
      distance: sim.s / PX_PER_M,
      velocity: sim.v,
      elapsed: sim.t,
      normalForce,
      frictionForce,
      drivingForce,
      angleDeg,
      frictionMu,
      initialVelocity: initialVelocityMps,
    });
  }, [accel, sim, normalForce, frictionForce, drivingForce, angleDeg, frictionMu]);

  const origin = { x: ORIGIN_X, y: ORIGIN_Y };
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rampStart = useMemo(
    () => ({
      x: origin.x + S_MIN * cos,
      y: origin.y + S_MIN * sin,
    }),
    [rad]
  );
  const rampEnd = useMemo(
    () => ({
      x: origin.x + TRACK_LEN * cos,
      y: origin.y + TRACK_LEN * sin,
    }),
    [rad]
  );
  const nx = -Math.sin(rad);
  const ny = -Math.cos(rad);
  const blockCenter = {
    x: origin.x + sim.s * cos + nx * 14,
    y: origin.y + sim.s * sin + ny * 14,
  };

  const tx = VIEW_W / 2 - blockCenter.x;
  const ty = VIEW_H / 2 - blockCenter.y;

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ width: '100%', display: 'block', borderRadius: 12, background: '#0b132b' }}>
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#1e293b" />
      <g transform={`translate(${tx}, ${ty})`}>
        <polygon
          points={`${rampStart.x},${rampStart.y} ${rampEnd.x},${rampEnd.y} ${rampStart.x},${rampEnd.y}`}
          fill="#334155"
          opacity="0.6"
        />
        <line x1={rampStart.x} y1={rampStart.y} x2={rampEnd.x} y2={rampEnd.y} stroke="#f8fafc" strokeWidth="6" />
        <rect
          x={blockCenter.x - 18}
          y={blockCenter.y - 14}
          width="36"
          height="28"
          rx="5"
          fill="#f59e0b"
          stroke="#fef3c7"
          strokeWidth="2"
          transform={`rotate(${angleDeg} ${blockCenter.x} ${blockCenter.y})`}
        />
      </g>
      <text x="24" y="28" fill="#e2e8f0" fontSize="14">
        公式步进 · 镜头跟随 | v₀ = {initialVelocityMps.toFixed(2)} m/s | a = {accel.toFixed(2)} m/s² | v = {sim.v.toFixed(2)} m/s | s = {(sim.s / PX_PER_M).toFixed(2)} m
        {sim.s >= TRACK_LEN ? ' | 已到底端' : ''}
      </text>
    </svg>
  );
};

export default InclineFrictionScene;
