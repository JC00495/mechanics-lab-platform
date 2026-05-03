import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Circle, Line, Text, Group } from 'react-konva';
import Matter from 'matter-js';

const WIDTH = 800;
const HEIGHT = 450;
const GROUND_Y = HEIGHT - 50;
const V_MAX = 5;
/** 水平位移（px）折成速度标定 */
const DRAG_TO_V = 0.035;

function ballRadius(mass) {
  return Math.max(18, Math.min(35, 15 + mass / 4));
}

const PhysicsScene = forwardRef(
  (
    {
      velocity1,
      velocity2,
      mass1,
      mass2,
      frictionAir = 0.004,
      restitution = 0.9,
      friction = 0,
      isRunning,
      onCollision,
      onMomentumChange,
      onVelocityChange,
      velocitySetMode = 'slider',
      /** 拖拽结束：写入 v₁、v₂ 并自动开始运动（仅拖拽模式） */
      onDragCommitRun,
      onBallCollisionDetail,
    },
    ref
  ) => {
    const stageRef = useRef(null);
    const engineRef = useRef(null);
    const ballARef = useRef(null);
    const ballBRef = useRef(null);
    const collisionCountRef = useRef(0);
    const lastCollisionTimeRef = useRef(0);
    const isRunningRef = useRef(isRunning);
    const wasRunningRef = useRef(false);
    const [, setFrame] = useState(0);
    const onCollisionRef = useRef(onCollision);
    const onMomentumRef = useRef(onMomentumChange);
    const onCollisionDetailRef = useRef(onBallCollisionDetail);
    const onVelocityChangeRef = useRef(onVelocityChange);
    const onDragCommitRunRef = useRef(onDragCommitRun);
    const velocitySetModeRef = useRef(velocitySetMode);
    const velPropsRef = useRef({ v1: velocity1, v2: velocity2 });
    const pendingVelSampleRef = useRef(null);
    const massRef = useRef({ m1: mass1, m2: mass2 });
    massRef.current = { m1: mass1, m2: mass2 };
    velocitySetModeRef.current = velocitySetMode;
    velPropsRef.current = { v1: velocity1, v2: velocity2 };

    /** @type {React.MutableRefObject<{ ball: 'A'|'B', pointerStartX: number, ballStartX: number } | null>} */
    const dragRef = useRef(null);
    const [dragPreview, setDragPreview] = useState(null);

    useEffect(() => {
      onCollisionRef.current = onCollision;
    }, [onCollision]);
    useEffect(() => {
      onMomentumRef.current = onMomentumChange;
    }, [onMomentumChange]);
    useEffect(() => {
      onCollisionDetailRef.current = onBallCollisionDetail;
    }, [onBallCollisionDetail]);
    useEffect(() => {
      onVelocityChangeRef.current = onVelocityChange;
    }, [onVelocityChange]);
    useEffect(() => {
      onDragCommitRunRef.current = onDragCommitRun;
    }, [onDragCommitRun]);

    useEffect(() => {
      isRunningRef.current = isRunning;
    }, [isRunning]);

    useEffect(() => {
      if (isRunning && dragRef.current) {
        dragRef.current = null;
        setDragPreview(null);
      }
    }, [isRunning]);

    const clampV = (v) => Math.max(-V_MAX, Math.min(V_MAX, v));

    const applyRunningVelocities = useCallback(() => {
      if (!ballARef.current || !ballBRef.current) return;
      Matter.Body.setVelocity(ballARef.current, { x: velocity1, y: 0 });
      Matter.Body.setVelocity(ballBRef.current, { x: velocity2, y: 0 });
    }, [velocity1, velocity2]);

    const commitDrag = useCallback(() => {
      const d = dragRef.current;
      const useDragRun = velocitySetModeRef.current === 'drag' && onDragCommitRunRef.current;
      if (!d || (!useDragRun && !onVelocityChangeRef.current)) {
        dragRef.current = null;
        setDragPreview(null);
        return;
      }
      const body = d.ball === 'A' ? ballARef.current : ballBRef.current;
      if (!body) {
        dragRef.current = null;
        setDragPreview(null);
        return;
      }
      const vx = clampV((body.position.x - d.ballStartX) * DRAG_TO_V);
      const { v1: pv1, v2: pv2 } = velPropsRef.current;
      const v1f = d.ball === 'A' ? vx : pv1;
      const v2f = d.ball === 'B' ? vx : pv2;
      dragRef.current = null;
      setDragPreview(null);
      if (useDragRun) {
        onDragCommitRunRef.current({ v1: v1f, v2: v2f });
      } else {
        onVelocityChangeRef.current(d.ball, vx);
      }
    }, []);

    useEffect(() => {
      if (!dragPreview && !dragRef.current) return;
      const onUp = (ev) => {
        if (ev.button !== undefined && ev.button !== 0) return;
        if (dragRef.current) commitDrag();
      };
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      return () => {
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
    }, [dragPreview, commitDrag]);

    useEffect(() => {
      const engine = Matter.Engine.create();
      engine.gravity.x = 0;
      engine.gravity.y = 0;
      engine.gravity.scale = 0;
      engineRef.current = engine;

      const ground = Matter.Bodies.rectangle(WIDTH / 2, GROUND_Y + 15, WIDTH, 30, {
        isStatic: true,
        restitution: 0.9,
        label: 'ground',
      });
      const leftWall = Matter.Bodies.rectangle(-15, HEIGHT / 2, 30, HEIGHT, {
        isStatic: true,
        restitution: 0.9,
        label: 'leftWall',
      });
      const rightWall = Matter.Bodies.rectangle(WIDTH + 15, HEIGHT / 2, 30, HEIGHT, {
        isStatic: true,
        restitution: 0.9,
        label: 'rightWall',
      });
      const ceiling = Matter.Bodies.rectangle(WIDTH / 2, -15, WIDTH, 30, {
        isStatic: true,
        restitution: 0.9,
        label: 'ceiling',
      });

      const r1 = ballRadius(mass1);
      const r2 = ballRadius(mass2);
      const ballA = Matter.Bodies.circle(200, GROUND_Y - r1, r1, {
        restitution,
        friction,
        frictionAir,
        label: 'ballA',
        mass: mass1,
        inertia: Infinity,
        inverseInertia: 0,
      });
      const ballB = Matter.Bodies.circle(550, GROUND_Y - r2, r2, {
        restitution,
        friction,
        frictionAir,
        label: 'ballB',
        mass: mass2,
        inertia: Infinity,
        inverseInertia: 0,
      });
      Matter.Body.setVelocity(ballA, { x: 0, y: 0 });
      Matter.Body.setVelocity(ballB, { x: 0, y: 0 });

      ballARef.current = ballA;
      ballBRef.current = ballB;

      Matter.World.add(engine.world, [ground, leftWall, rightWall, ceiling, ballA, ballB]);

      const isBallBall = (bodyA, bodyB) =>
        (bodyA.label === 'ballA' && bodyB.label === 'ballB') ||
        (bodyA.label === 'ballB' && bodyB.label === 'ballA');

      Matter.Events.on(engine, 'collisionStart', (event) => {
        if (!isRunningRef.current) return;
        const now = Date.now();
        event.pairs.forEach((pair) => {
          const { bodyA, bodyB } = pair;
          if (!isBallBall(bodyA, bodyB)) return;
          if (now - lastCollisionTimeRef.current <= 100) return;
          lastCollisionTimeRef.current = now;
          collisionCountRef.current += 1;
          onCollisionRef.current?.(collisionCountRef.current);

          const ballABody = bodyA.label === 'ballA' ? bodyA : bodyB;
          const ballBBody = bodyA.label === 'ballB' ? bodyA : bodyB;
          pendingVelSampleRef.current = {
            v1i: ballABody.velocity.x,
            v2i: ballBBody.velocity.x,
          };
        });
      });

      Matter.Events.on(engine, 'collisionEnd', (event) => {
        if (!isRunningRef.current) return;
        event.pairs.forEach((pair) => {
          const { bodyA, bodyB } = pair;
          if (!isBallBall(bodyA, bodyB)) return;
          const snap = pendingVelSampleRef.current;
          if (!snap || !ballARef.current || !ballBRef.current) return;
          onCollisionDetailRef.current?.({
            v1i: snap.v1i,
            v2i: snap.v2i,
            v1f: ballARef.current.velocity.x,
            v2f: ballBRef.current.velocity.x,
          });
          pendingVelSampleRef.current = null;
        });
      });

      let raf;
      const loop = () => {
        if (engineRef.current && isRunningRef.current) {
          Matter.Engine.update(engineRef.current, 1000 / 60);
        }
        if (ballARef.current && ballBRef.current && onMomentumRef.current) {
          const m1 = ballARef.current.mass;
          const m2 = ballBRef.current.mass;
          const v1 = ballARef.current.velocity.x;
          const v2 = ballBRef.current.velocity.x;
          onMomentumRef.current((m1 * v1 + m2 * v2).toFixed(2));
        }
        setFrame((n) => (n + 1) % 1000000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      return () => {
        cancelAnimationFrame(raf);
        Matter.Engine.clear(engine);
        Matter.World.clear(engine.world, false);
      };
    }, []);

    useEffect(() => {
      if (!ballARef.current || !ballBRef.current) return;
      ballARef.current.frictionAir = frictionAir;
      ballBRef.current.frictionAir = frictionAir;
      ballARef.current.restitution = restitution;
      ballBRef.current.restitution = restitution;
      ballARef.current.friction = friction;
      ballBRef.current.friction = friction;
    }, [frictionAir, restitution, friction]);

    useEffect(() => {
      if (!ballARef.current || !ballBRef.current) return;
      if (!isRunning) {
        Matter.Body.setVelocity(ballARef.current, { x: 0, y: 0 });
        Matter.Body.setVelocity(ballBRef.current, { x: 0, y: 0 });
        wasRunningRef.current = false;
        return;
      }
      if (!wasRunningRef.current) {
        applyRunningVelocities();
        wasRunningRef.current = true;
      }
    }, [isRunning, applyRunningVelocities]);

    useEffect(() => {
      if (!ballARef.current || !ballBRef.current || !engineRef.current) return;

      const engine = engineRef.current;
      const posA = ballARef.current.position;
      const posB = ballBRef.current.position;
      const velA = ballARef.current.velocity.x;
      const velB = ballBRef.current.velocity.x;

      Matter.World.remove(engine.world, ballARef.current);
      Matter.World.remove(engine.world, ballBRef.current);

      const r1 = ballRadius(mass1);
      const r2 = ballRadius(mass2);
      const newA = Matter.Bodies.circle(posA.x, posA.y, r1, {
        restitution,
        friction,
        frictionAir,
        label: 'ballA',
        mass: mass1,
        inertia: Infinity,
        inverseInertia: 0,
      });
      const newB = Matter.Bodies.circle(posB.x, posB.y, r2, {
        restitution,
        friction,
        frictionAir,
        label: 'ballB',
        mass: mass2,
        inertia: Infinity,
        inverseInertia: 0,
      });
      Matter.Body.setVelocity(newA, { x: velA, y: 0 });
      Matter.Body.setVelocity(newB, { x: velB, y: 0 });

      ballARef.current = newA;
      ballBRef.current = newB;
      Matter.World.add(engine.world, [newA, newB]);
    }, [mass1, mass2, frictionAir, restitution, friction]);

    useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          if (!ballARef.current || !ballBRef.current) return;
          const r1 = ballRadius(mass1);
          const r2 = ballRadius(mass2);
          Matter.Body.setPosition(ballARef.current, { x: 200, y: GROUND_Y - r1 });
          Matter.Body.setPosition(ballBRef.current, { x: 550, y: GROUND_Y - r2 });
          Matter.Body.setVelocity(ballARef.current, { x: 0, y: 0 });
          Matter.Body.setVelocity(ballBRef.current, { x: 0, y: 0 });
          collisionCountRef.current = 0;
          lastCollisionTimeRef.current = 0;
          pendingVelSampleRef.current = null;
          dragRef.current = null;
          setDragPreview(null);
          wasRunningRef.current = false;
          onCollisionRef.current?.(0);
        },
      }),
      [mass1, mass2]
    );

    const onBallPointerDown = (ball, e) => {
      if (velocitySetMode !== 'drag') return;
      if (isRunning) return;
      if (e.evt?.pointerType === 'mouse' && e.evt.button !== 0) return;
      e.cancelBubble = true;
      const stage = e.target.getStage();
      const p = stage?.getPointerPosition();
      if (!p) return;
      const body = ball === 'A' ? ballARef.current : ballBRef.current;
      if (!body) return;
      dragRef.current = {
        ball,
        pointerStartX: p.x,
        ballStartX: body.position.x,
      };
      setDragPreview({ ball, vx: 0 });
    };

    const onStagePointerMove = () => {
      if (velocitySetMode !== 'drag') return;
      const d = dragRef.current;
      if (!d || isRunning) return;
      const stage = stageRef.current;
      if (!stage) return;
      const p = stage.getPointerPosition();
      if (!p) return;

      const body = d.ball === 'A' ? ballARef.current : ballBRef.current;
      const other = d.ball === 'A' ? ballBRef.current : ballARef.current;
      if (!body || !other) return;

      const { m1, m2 } = massRef.current;
      const r = d.ball === 'A' ? ballRadius(m1) : ballRadius(m2);
      const or = d.ball === 'A' ? ballRadius(m2) : ballRadius(m1);
      const y = GROUND_Y - r;

      const dx = p.x - d.pointerStartX;
      const rawX = d.ballStartX + dx;
      let newX = Math.max(r, Math.min(WIDTH - r, rawX));

      if (newX !== rawX) {
        Matter.Body.setPosition(body, { x: newX, y });
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        commitDrag();
        return;
      }

      const otherX = other.position.x;
      const minSep = r + or;
      if (Math.abs(newX - otherX) < minSep) {
        const approachFromRight = rawX > otherX;
        newX = approachFromRight ? otherX + minSep : otherX - minSep;
        newX = Math.max(r, Math.min(WIDTH - r, newX));
        Matter.Body.setPosition(body, { x: newX, y });
        Matter.Body.setVelocity(body, { x: 0, y: 0 });
        commitDrag();
        return;
      }

      Matter.Body.setPosition(body, { x: newX, y });
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      const vxPreview = clampV((newX - d.ballStartX) * DRAG_TO_V);
      setDragPreview({ ball: d.ball, vx: vxPreview });
    };

    const posA = ballARef.current?.position ?? { x: 200, y: GROUND_Y - ballRadius(mass1) };
    const posB = ballBRef.current?.position ?? { x: 550, y: GROUND_Y - ballRadius(mass2) };
    const r1 = ballARef.current?.circleRadius ?? ballRadius(mass1);
    const r2 = ballBRef.current?.circleRadius ?? ballRadius(mass2);
    const velA = ballARef.current?.velocity.x ?? 0;
    const velB = ballBRef.current?.velocity.x ?? 0;

    const showV1 = isRunning ? velA : velocity1;
    const showV2 = isRunning ? velB : velocity2;

    const velColor = (v) => (v > 0.05 ? '#4CAF50' : v < -0.05 ? '#f44336' : '#888');

    const arrowElements = (cx, cy, r, v) => {
      if (Math.abs(v) <= 0.05) {
        return (
          <Text
            x={cx}
            y={cy - r - 12}
            text="静止"
            fontSize={11}
            fill="rgba(255,255,255,0.55)"
            align="center"
            offsetX={14}
          />
        );
      }
      const scale = 18;
      const x2 = cx + v * scale;
      const y = cy - r - 10;
      const col = velColor(v);
      return (
        <Group listening={false}>
          <Line points={[cx, y, x2, y]} stroke={col} strokeWidth={3} lineCap="round" />
          <Circle x={x2} y={y} radius={5} fill={col} />
          <Text
            x={cx}
            y={y - 14}
            text={`${v.toFixed(1)} m/s`}
            fontSize={11}
            fill="white"
            align="center"
            offsetX={22}
          />
        </Group>
      );
    };

    const previewArrow =
      dragPreview && !isRunning ? (
        <Group listening={false}>
          {arrowElements(
            dragPreview.ball === 'A' ? posA.x : posB.x,
            dragPreview.ball === 'A' ? posA.y : posB.y,
            dragPreview.ball === 'A' ? r1 : r2,
            dragPreview.vx
          )}
        </Group>
      ) : null;

    return (
      <Stage
        width={WIDTH}
        height={HEIGHT}
        ref={stageRef}
        style={{
          width: '100%',
          height: 'auto',
          borderRadius: 12,
          display: 'block',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
          cursor: !isRunning && velocitySetMode === 'drag' ? 'grab' : 'default',
        }}
        onPointerMove={onStagePointerMove}
      >
        <Layer>
          <Rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="#1a1a2e" listening={false} />
          {Array.from({ length: Math.ceil(WIDTH / 50) }, (_, i) => (
            <Line
              key={`v${i}`}
              points={[i * 50, 0, i * 50, HEIGHT]}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
              listening={false}
            />
          ))}
          {Array.from({ length: Math.ceil(HEIGHT / 50) }, (_, i) => (
            <Line
              key={`h${i}`}
              points={[0, i * 50, WIDTH, i * 50]}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
              listening={false}
            />
          ))}
          <Line
            points={[WIDTH / 2, 0, WIDTH / 2, HEIGHT]}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
            listening={false}
          />
          <Rect x={0} y={GROUND_Y} width={WIDTH} height={8} fill="#5a3a1a" listening={false} />
          <Rect x={0} y={GROUND_Y + 8} width={WIDTH} height={12} fill="rgba(90,58,26,0.35)" listening={false} />

          <Circle
            x={posA.x}
            y={posA.y}
            radius={r1}
            fillLinearGradientStartPoint={{ x: -r1, y: -r1 }}
            fillLinearGradientEndPoint={{ x: r1, y: r1 }}
            fillLinearGradientColorStops={[0, '#ff6b6b', 1, '#ee5a24']}
            stroke="white"
            strokeWidth={2}
            shadowBlur={10}
            shadowColor="rgba(0,0,0,0.35)"
            listening={!isRunning && velocitySetMode === 'drag'}
            onPointerDown={(e) => onBallPointerDown('A', e)}
          />
          <Text
            x={posA.x}
            y={posA.y}
            text="A"
            fontSize={Math.floor(r1 * 0.65)}
            fontStyle="bold"
            fill="white"
            align="center"
            verticalAlign="middle"
            offsetX={Math.floor(r1 * 0.2)}
            offsetY={Math.floor(r1 * 0.33)}
            listening={false}
          />
          {!dragPreview || dragPreview.ball !== 'A' ? arrowElements(posA.x, posA.y, r1, showV1) : null}

          <Circle
            x={posB.x}
            y={posB.y}
            radius={r2}
            fillLinearGradientStartPoint={{ x: -r2, y: -r2 }}
            fillLinearGradientEndPoint={{ x: r2, y: r2 }}
            fillLinearGradientColorStops={[0, '#4ecdc4', 1, '#44bd9e']}
            stroke="white"
            strokeWidth={2}
            shadowBlur={10}
            shadowColor="rgba(0,0,0,0.35)"
            listening={!isRunning && velocitySetMode === 'drag'}
            onPointerDown={(e) => onBallPointerDown('B', e)}
          />
          <Text
            x={posB.x}
            y={posB.y}
            text="B"
            fontSize={Math.floor(r2 * 0.65)}
            fontStyle="bold"
            fill="white"
            align="center"
            verticalAlign="middle"
            offsetX={Math.floor(r2 * 0.2)}
            offsetY={Math.floor(r2 * 0.33)}
            listening={false}
          />
          {!dragPreview || dragPreview.ball !== 'B' ? arrowElements(posB.x, posB.y, r2, showV2) : null}

          {previewArrow}

          <Group listening={false}>
            <Rect x={12} y={12} width={210} height={78} fill="rgba(0,0,0,0.72)" cornerRadius={8} />
            <Circle x={32} y={32} radius={6} fill="#4CAF50" />
            <Text x={48} y={24} text="→ 正方向（向右）" fontSize={12} fill="white" />
            <Circle x={32} y={54} radius={6} fill="#f44336" />
            <Text x={48} y={46} text="← 负方向（向左）" fontSize={12} fill="white" />
            <Text
              x={24}
              y={66}
              text={
                isRunning
                  ? '运动中：观察碰撞'
                  : velocitySetMode === 'drag'
                    ? '左键水平拖球，松手后自动开始'
                    : '滑块模式：下方滑条设 v'
              }
              fontSize={10}
              fill="#aaa"
            />
          </Group>
        </Layer>
      </Stage>
    );
  }
);

PhysicsScene.displayName = 'PhysicsScene';

export default PhysicsScene;
