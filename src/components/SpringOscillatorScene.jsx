import React, { useEffect, useMemo, useRef, useState } from 'react';

const VIEW_W = 800;
const VIEW_H = 360;
const GROUND_Y = 250;
const BASE_X = 170;
const BLOCK_W = 76;
const BLOCK_H = 56;
const MAX_DISP = 120;

function buildSpringPath(startX, endX, y) {
  // 根据两端点动态生成弹簧折线，便于随位移实时拉伸
  const coils = 9;
  const pad = 20;
  const amp = 16;
  const span = Math.max(10, endX - startX - pad * 2);
  const step = span / (coils * 2);
  let path = `M ${startX} ${y} L ${startX + pad} ${y}`;
  for (let i = 0; i < coils * 2; i += 1) {
    const x = startX + pad + step * (i + 1);
    const yi = i % 2 === 0 ? y - amp : y + amp;
    path += ` L ${x} ${yi}`;
  }
  path += ` L ${endX} ${y}`;
  return path;
}

const SpringOscillatorScene = ({
  mass = 2,
  springK = 20,
  damping = 0.2,
  initialDisplacement = 0.1,
  resetToken = 0,
  isRunning = false,
  onMetricsChange,
}) => {
  // x: 位移(m)，v: 速度(m/s)，t: 时间(s)
  const [state, setState] = useState({
    x: initialDisplacement,
    v: 0,
    t: 0,
  });
  const refState = useRef(state);
  const refRunning = useRef(isRunning);
  const rafRef = useRef(null);
  const prevRef = useRef(null);

  useEffect(() => {
    refRunning.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    const reset = { x: initialDisplacement, v: 0, t: 0 };
    refState.current = reset;
    setState(reset);
  }, [initialDisplacement, mass, springK, damping, resetToken]);

  useEffect(() => {
    const loop = (ts) => {
      if (!prevRef.current) prevRef.current = ts;
      const dt = Math.min((ts - prevRef.current) / 1000, 0.03);
      prevRef.current = ts;

      if (refRunning.current) {
        const s = refState.current;
        // m*x'' + c*x' + k*x = 0 的离散积分
        const acc = -(springK / mass) * s.x - (damping / mass) * s.v;
        const nextV = s.v + acc * dt;
        const nextX = Math.max(-MAX_DISP / 100, Math.min(MAX_DISP / 100, s.x + nextV * dt));
        const next = { x: nextX, v: nextV, t: s.t + dt };
        refState.current = next;
        setState(next);
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [mass, springK, damping]);

  const period = 2 * Math.PI * Math.sqrt(mass / springK);
  const omega = Math.sqrt(springK / mass);
  const kinetic = 0.5 * mass * state.v * state.v;
  const potential = 0.5 * springK * state.x * state.x;
  const totalEnergy = kinetic + potential;

  useEffect(() => {
    onMetricsChange?.({
      displacement: state.x,
      velocity: state.v,
      period,
      omega,
      kinetic,
      potential,
      totalEnergy,
      elapsed: state.t,
    });
  }, [state, period, omega, kinetic, potential, totalEnergy, onMetricsChange]);

  const blockX = BASE_X + 220 + state.x * 240;
  const springPath = useMemo(() => buildSpringPath(BASE_X, blockX, GROUND_Y - BLOCK_H / 2), [blockX]);

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ width: '100%', display: 'block', borderRadius: 12, background: '#101827' }}>
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#1f2937" />
      <line x1="0" y1={GROUND_Y + 35} x2={VIEW_W} y2={GROUND_Y + 35} stroke="#334155" strokeWidth="16" />
      <rect x={BASE_X - 20} y={GROUND_Y - 90} width="20" height="130" fill="#64748b" />
      <path d={springPath} stroke="#94a3b8" strokeWidth="5" fill="none" />
      <rect x={blockX} y={GROUND_Y - BLOCK_H} width={BLOCK_W} height={BLOCK_H} rx="8" fill="#60a5fa" stroke="#dbeafe" strokeWidth="2" />
      <text x={blockX + 24} y={GROUND_Y - 22} fill="white" fontSize="18" fontWeight="700">
        m
      </text>
      <text x="22" y="28" fill="#e2e8f0" fontSize="16">
        x = {state.x.toFixed(3)} m | v = {state.v.toFixed(3)} m/s | T = {period.toFixed(2)} s
      </text>
    </svg>
  );
};

export default SpringOscillatorScene;
