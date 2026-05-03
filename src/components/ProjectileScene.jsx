import React, { useEffect, useMemo, useRef, useState } from 'react';

const VIEW_W = 800;
const VIEW_H = 360;
const G = 9.81;
const SCALE = 18;
const MAX_LAUNCH_SPEED = 32;

const ProjectileScene = ({
  speed = 16,
  angleDeg = 40,
  drag = 0.02,
  isRunning = false,
  resetToken = 0,
  onMetricsChange,
  onReachGround,
}) => {
  // sim 使用“世界坐标(米)”保存，渲染时再映射到屏幕像素
  const [sim, setSim] = useState({ x: 0, y: 0, vx: 0, vy: 0, t: 0, landed: false });
  const [trail, setTrail] = useState([]);
  const runRef = useRef(isRunning);
  const simRef = useRef(sim);
  const rafRef = useRef(null);
  const prevRef = useRef(null);

  useEffect(() => {
    runRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    // 重置发射：限制最大初速度，避免超高速导致数值不稳定
    const safeSpeed = Math.min(MAX_LAUNCH_SPEED, Math.max(0, speed));
    const rad = (angleDeg * Math.PI) / 180;
    const init = { x: 0, y: 0, vx: safeSpeed * Math.cos(rad), vy: safeSpeed * Math.sin(rad), t: 0, landed: false };
    simRef.current = init;
    setSim(init);
    setTrail([]);
  }, [speed, angleDeg, resetToken, drag]);

  useEffect(() => {
    const step = (ts) => {
      if (!prevRef.current) prevRef.current = ts;
      const dt = Math.min((ts - prevRef.current) / 1000, 0.03);
      prevRef.current = ts;
      if (runRef.current && !simRef.current.landed) {
        const s = simRef.current;
        // 简化空气阻力模型：对速度分量做线性衰减
        const vx = s.vx * (1 - drag * dt);
        const vy = s.vy - G * dt - drag * s.vy * dt;
        const x = s.x + vx * dt;
        const y = s.y + vy * dt;
        let next = { x, y, vx, vy, t: s.t + dt, landed: false };
        if (y <= 0 && s.t > 0.02) {
          // 落地即锁定到 y=0，并回调外层自动暂停
          next = { ...next, y: 0, landed: true };
          onReachGround?.(next);
        }
        simRef.current = next;
        setSim(next);
        setTrail((prev) => [...prev, { x: next.x, y: next.y }].slice(-320));
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => rafRef.current && cancelAnimationFrame(rafRef.current);
  }, [drag, onReachGround]);

  const speedNow = Math.sqrt(sim.vx * sim.vx + sim.vy * sim.vy);
  const range = sim.x;
  const height = Math.max(0, sim.y);
  const worldX = 80 + sim.x * SCALE;
  const worldY = 300 - sim.y * SCALE;
  // 镜头跟随：水平追踪前进，垂直在接近上边界时上移
  const cameraX = Math.max(0, worldX - VIEW_W * 0.62);
  const topMargin = 48;
  const cameraY = Math.max(0, topMargin - worldY);
  const px = worldX - cameraX;
  const py = worldY + cameraY;
  const trailPoints = useMemo(
    () => trail.map((p) => ({ x: 80 + p.x * SCALE - cameraX, y: 300 - p.y * SCALE + cameraY })),
    [trail, cameraX, cameraY]
  );

  useEffect(() => {
    onMetricsChange?.({
      time: sim.t,
      range,
      height,
      speed: speedNow,
      vx: sim.vx,
      vy: sim.vy,
      landed: sim.landed,
    });
  }, [sim, range, height, speedNow, onMetricsChange]);

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ width: '100%', display: 'block', borderRadius: 12, background: '#0c4a6e' }}>
      <rect width={VIEW_W} height={VIEW_H} fill="#075985" />
      <line x1="0" y1={300 + cameraY} x2={VIEW_W} y2={300 + cameraY} stroke="#fef3c7" strokeWidth="4" />
      {trailPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill="#bfdbfe" />
      ))}
      <circle
        cx={Math.min(VIEW_W - 10, px)}
        cy={Math.min(VIEW_H - 16, Math.max(20, py))}
        r="9"
        fill="#f97316"
        stroke="#ffedd5"
        strokeWidth="2"
      />
      <text x="20" y="28" fill="#e0f2fe" fontSize="16">
        t={sim.t.toFixed(2)}s | h={height.toFixed(2)}m | R={range.toFixed(2)}m | v={speedNow.toFixed(2)}m/s
      </text>
      <text x="20" y="50" fill="#bae6fd" fontSize="12">
        视角: 自动跟随弹丸（水平+垂直）
      </text>
    </svg>
  );
};

export default ProjectileScene;
