import React, { useEffect, useRef, useState } from 'react';

const VIEW_W = 800;
const VIEW_H = 360;
const G = 9.81;

const PendulumScene = ({
  length = 1.2,
  mass = 1,
  damping = 0.02,
  initialAngleDeg = 20,
  isRunning = false,
  resetToken = 0,
  onMetricsChange,
}) => {
  // theta: 角位移(rad)，omega: 角速度(rad/s)
  const [sim, setSim] = useState({ theta: (initialAngleDeg * Math.PI) / 180, omega: 0, t: 0 });
  const refSim = useRef(sim);
  const runRef = useRef(isRunning);
  const rafRef = useRef(null);
  const prevRef = useRef(null);

  useEffect(() => {
    runRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    const init = { theta: (initialAngleDeg * Math.PI) / 180, omega: 0, t: 0 };
    refSim.current = init;
    setSim(init);
  }, [initialAngleDeg, length, damping, mass, resetToken]);

  useEffect(() => {
    const step = (ts) => {
      if (!prevRef.current) prevRef.current = ts;
      const dt = Math.min((ts - prevRef.current) / 1000, 0.03);
      prevRef.current = ts;
      if (runRef.current) {
        const s = refSim.current;
        // 单摆近似动力学：角加速度由重力项与阻尼项共同决定
        const alpha = -(G / length) * Math.sin(s.theta) - damping * s.omega;
        const omega = s.omega + alpha * dt;
        const theta = s.theta + omega * dt;
        const next = { theta, omega, t: s.t + dt };
        refSim.current = next;
        setSim(next);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [length, damping]);

  const period = 2 * Math.PI * Math.sqrt(length / G);
  const speed = Math.abs(sim.omega * length);
  const kinetic = 0.5 * mass * speed * speed;
  const potential = mass * G * length * (1 - Math.cos(sim.theta));

  useEffect(() => {
    onMetricsChange?.({
      angleDeg: (sim.theta * 180) / Math.PI,
      omega: sim.omega,
      speed,
      period,
      kinetic,
      potential,
      totalEnergy: kinetic + potential,
      elapsed: sim.t,
    });
  }, [sim, speed, period, kinetic, potential, onMetricsChange]);

  const pivot = { x: 400, y: 56 };
  const pxLen = Math.min(200, Math.max(100, length * 130));
  const bob = { x: pivot.x + pxLen * Math.sin(sim.theta), y: pivot.y + pxLen * Math.cos(sim.theta) };
  const radius = 14 + mass * 5;

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ width: '100%', display: 'block', borderRadius: 12, background: '#0f172a' }}>
      <rect width={VIEW_W} height={VIEW_H} fill="#1e293b" />
      <line x1={pivot.x} y1={pivot.y} x2={bob.x} y2={bob.y} stroke="#e2e8f0" strokeWidth="4" />
      <circle cx={pivot.x} cy={pivot.y} r="8" fill="#94a3b8" />
      <circle cx={bob.x} cy={bob.y} r={radius} fill="#22d3ee" stroke="#cffafe" strokeWidth="2" />
      <text x="20" y="28" fill="#e2e8f0" fontSize="16">
        θ = {((sim.theta * 180) / Math.PI).toFixed(2)}° | v = {speed.toFixed(2)} m/s | T≈{period.toFixed(2)} s
      </text>
    </svg>
  );
};

export default PendulumScene;
