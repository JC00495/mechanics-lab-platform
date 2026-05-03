import React, { useState, useEffect, useRef, useCallback } from 'react';
import PhysicsScene from './components/PhysicsScene';
import SpringOscillatorScene from './components/SpringOscillatorScene';
import InclineFrictionScene from './components/InclineFrictionScene';
import PendulumScene from './components/PendulumScene';
import ProjectileScene from './components/ProjectileScene';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';
import { logOperation } from './lib/operationLog';
import { createDefaultNickname, ensureProfile, fetchProfile, updateNickname } from './lib/profile';
import {
  fetchLearningRecords,
  insertLearningRecord,
  clearLearningRecords,
} from './lib/learningRecords';
import './App.css';

const LAST_EXPERIMENT_KEY = 'last_selected_experiment';

const EXPERIMENT_MODULES = [
  {
    type: 'collision',
    title: '⚡ 动量守恒（碰撞）实验',
    description: '通过双球碰撞观察动量守恒过程，支持滑块/拖拽设速与实时可视化。',
    status: 'online',
    statusLabel: '已上线',
  },
  {
    type: 'spring',
    title: '🌀 弹簧振子实验',
    description: '调节质量、劲度系数与阻尼，观察位移、速度和机械能变化。',
    status: 'online',
    statusLabel: '已上线',
  },
  {
    type: 'incline',
    title: '🧱 斜面摩擦实验',
    description: '调节倾角与摩擦系数，观察加速度、位移和受力分解变化。',
    status: 'online',
    statusLabel: '已上线',
  },
  {
    type: 'pendulum',
    title: '🪀 单摆实验',
    description: '调节摆长、摆球质量与阻尼，观察周期、角速度与机械能。',
    status: 'online',
    statusLabel: '已上线',
  },
  {
    type: 'projectile',
    title: '🚀 抛体运动实验',
    description: '调节初速度、发射角与空气阻力，观察轨迹、高度与射程。',
    status: 'online',
    statusLabel: '已上线',
  },
];

const App = () => {
  // 页面级状态：导航、登录态、实验参数与学习记录统一在此管理
  const [page, setPage] = useState('home');
  const [selectedExperiment, setSelectedExperiment] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);

  const [velocity1, setVelocity1] = useState(0);
  const [velocity2, setVelocity2] = useState(0);
  const [mass1, setMass1] = useState(20);
  const [mass2, setMass2] = useState(20);
  const [airResistance, setAirResistance] = useState(0.004);
  const [restitution, setRestitution] = useState(0.9);
  const [friction, setFriction] = useState(0);
  const [collisionCount, setCollisionCount] = useState(0);
  const [currentMomentum, setCurrentMomentum] = useState(0);

  const [isRunning, setIsRunning] = useState(false);
  /** slider：滑块设速；drag：仅画布拖拽设速 */
  const [velocitySetMode, setVelocitySetMode] = useState('slider');
  /** 点击「开始运动」瞬间的初速度（用于对照） */
  const [sessionInitial, setSessionInitial] = useState(null);
  /** 每次两球碰撞的碰前/碰后速度 */
  const [collisionVelLog, setCollisionVelLog] = useState([]);
  const [springMass, setSpringMass] = useState(2);
  const [springK, setSpringK] = useState(20);
  const [springDamping, setSpringDamping] = useState(0.2);
  const [springInitialDisp, setSpringInitialDisp] = useState(0.1);
  const [springRunning, setSpringRunning] = useState(false);
  const [springMetrics, setSpringMetrics] = useState(null);
  const [springResetToken, setSpringResetToken] = useState(0);
  const [inclineMass, setInclineMass] = useState(2);
  const [inclineAngle, setInclineAngle] = useState(30);
  const [inclineMu, setInclineMu] = useState(0.2);
  /** 沿斜面向下为正、向上为负，单位 m/s（与 Matter 中沿斜面切向一致） */
  const [inclineInitialVelocity, setInclineInitialVelocity] = useState(0);
  const [inclineRunning, setInclineRunning] = useState(false);
  const [inclineMetrics, setInclineMetrics] = useState(null);
  const [inclineResetToken, setInclineResetToken] = useState(0);
  const [pendulumLength, setPendulumLength] = useState(1.2);
  const [pendulumMass, setPendulumMass] = useState(1.2);
  const [pendulumDamping, setPendulumDamping] = useState(0.02);
  const [pendulumInitialAngle, setPendulumInitialAngle] = useState(20);
  const [pendulumRunning, setPendulumRunning] = useState(false);
  const [pendulumResetToken, setPendulumResetToken] = useState(0);
  const [pendulumMetrics, setPendulumMetrics] = useState(null);
  const [projectileSpeed, setProjectileSpeed] = useState(16);
  const [projectileAngle, setProjectileAngle] = useState(40);
  const [projectileDrag, setProjectileDrag] = useState(0.02);
  const [projectileRunning, setProjectileRunning] = useState(false);
  const [projectileResetToken, setProjectileResetToken] = useState(0);
  const [projectileMetrics, setProjectileMetrics] = useState(null);

  const [learningRecords, setLearningRecords] = useState([]);
  const [activeTab, setActiveTab] = useState('theory');
  const [recordFilterType, setRecordFilterType] = useState('all');

  const physicsRef = useRef(null);
  const onlineModules = EXPERIMENT_MODULES.filter((module) => module.status === 'online');
  const onlineModuleTypes = onlineModules.map((module) => module.type);

  const handleCollisionVel = useCallback((d) => {
    setCollisionVelLog((prev) =>
      [{ id: `${Date.now()}-${prev.length}`, v1i: d.v1i, v2i: d.v2i, v1f: d.v1f, v2f: d.v2f }, ...prev].slice(
        0,
        20
      )
    );
  }, []);

  /** 拖拽模式：松手/触墙触球后写入两球速度并直接开始运动 */
  const handleDragCommitRun = useCallback(({ v1, v2 }) => {
    setVelocity1(v1);
    setVelocity2(v2);
    setSessionInitial({ v1, v2 });
    setIsRunning(true);
    void logOperation('simulation_start', {
      mass1,
      mass2,
      velocity1: v1,
      velocity2: v2,
    });
  }, [mass1, mass2]);

  // 拉取并兜底初始化用户昵称
  const loadUserProfile = async (userId) => {
    try {
      await ensureProfile(userId);
      let profile = await fetchProfile(userId);
      if (profile && !profile.nickname.trim()) {
        profile = await updateNickname(userId, createDefaultNickname());
      }
      setCurrentUser((prev) => {
        if (!prev || prev.id !== userId) return prev;
        return { ...prev, nickname: profile?.nickname ?? '' };
      });
    } catch (err) {
      console.error('[profiles] load', err);
    }
  };

  // 将 Supabase session 用户映射到前端状态
  const applySessionUser = (user) => {
    if (!user) {
      setCurrentUser(null);
      setIsLoggedIn(false);
      setLearningRecords([]);
      setNicknameDraft('');
      setAccountStatus('');
      setPage('home');
      return;
    }
    setCurrentUser({
      id: user.id,
      email: user.email ?? '',
      createdAt: user.created_at,
      nickname: '',
    });
    setIsLoggedIn(true);
    void loadUserRecords(user.id);
    void loadUserProfile(user.id);
  };

  useEffect(() => {
    // 初始化登录态：增加超时保护，避免网络问题导致页面一直等待
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    let sessionSettled = false;

    const finishAuthInit = () => {
      if (!cancelled) setAuthReady(true);
    };

    const hangGuard = window.setTimeout(() => {
      if (cancelled || sessionSettled) return;
      console.warn('[auth] getSession 超时，请检查网络、VPN 或 VITE_SUPABASE_URL 是否可访问');
      applySessionUser(null);
      finishAuthInit();
    }, 15000);

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (cancelled) return;
        sessionSettled = true;
        window.clearTimeout(hangGuard);
        if (error) {
          console.error('[auth] getSession', error.message);
          applySessionUser(null);
          finishAuthInit();
          return;
        }
        applySessionUser(session?.user ?? null);
        finishAuthInit();
      })
      .catch((err) => {
        sessionSettled = true;
        window.clearTimeout(hangGuard);
        console.error('[auth] getSession failed', err);
        if (!cancelled) {
          applySessionUser(null);
          finishAuthInit();
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySessionUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(hangGuard);
      subscription.unsubscribe();
    };
  }, []);

  // 加载当前用户最近学习记录
  const loadUserRecords = async (userId) => {
    const records = await fetchLearningRecords(userId);
    setLearningRecords(records);
  };

  useEffect(() => {
    setNicknameDraft(currentUser?.nickname ?? '');
  }, [currentUser?.id, currentUser?.nickname]);

  useEffect(() => {
    const remembered = window.localStorage.getItem(LAST_EXPERIMENT_KEY);
    if (remembered && onlineModuleTypes.includes(remembered)) {
      setSelectedExperiment(remembered);
    }
  }, [onlineModuleTypes]);

  const handleRegister = async () => {
    setAuthError('');
    if (!email.trim()) {
      setAuthError('请输入邮箱');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setAuthError('邮箱格式不正确');
      return;
    }
    if (!password) {
      setAuthError('请输入密码');
      return;
    }
    if (password.length < 6) {
      setAuthError('密码长度至少 6 位（Supabase 默认要求）');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('两次输入的密码不一致');
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    if (data.user && !data.session) {
      setAuthError('');
      alert('注册成功。若项目开启了邮箱验证，请查收邮件完成验证后再登录。');
      setAuthMode('login');
      return;
    }
  };

  const handleLogin = async () => {
    setAuthError('');
    if (!email.trim()) {
      setAuthError('请输入邮箱');
      return;
    }
    if (!password) {
      setAuthError('请输入密码');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    void logOperation('login', { email: email.trim() });
  };

  const handleLogout = async () => {
    void logOperation('logout', {});
    await supabase.auth.signOut();
    setPage('home');
  };

  // 保存碰撞实验记录（取本轮第一次碰撞数据）
  const addRecord = async () => {
    // collisionVelLog：新碰撞插在队首，故「本轮第一次碰撞」在数组末尾
    const firstCollision = collisionVelLog[collisionVelLog.length - 1];
    if (!firstCollision) {
      alert('请先让两球发生碰撞：运行后相撞会在上方「两球碰撞速度记录」中出现数据，再点击保存。');
      return;
    }
    let saved;
    try {
      saved = await insertLearningRecord(currentUser.id, {
        experimentType: 'collision',
        v1i: firstCollision.v1i,
        v2i: firstCollision.v2i,
        v1f: firstCollision.v1f,
        v2f: firstCollision.v2f,
        mass1,
        mass2,
        frictionAir: airResistance,
        restitution,
        friction,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      alert(`保存失败：${msg}`);
      return;
    }
    setLearningRecords((prev) => [saved, ...prev].slice(0, 20));
    void logOperation('record_experiment', {
      v1i: firstCollision.v1i,
      v2i: firstCollision.v2i,
      v1f: firstCollision.v1f,
      v2f: firstCollision.v2f,
      mass1,
      mass2,
      frictionAir: airResistance,
      restitution,
      friction,
    });
    alert('✅ 已保存本轮第一次碰撞的碰前/碰后速度（Supabase）！');
  };

  // 保存弹簧振子实验关键参数与结果
  const addSpringRecord = async () => {
    if (!springMetrics) {
      alert('请先运行弹簧振子实验后再保存记录。');
      return;
    }
    let saved;
    try {
      saved = await insertLearningRecord(currentUser.id, {
        experimentType: 'spring',
        v1i: springInitialDisp,
        v2i: springMass,
        v1f: springMetrics.period,
        v2f: springMetrics.totalEnergy,
        mass1: springMass,
        mass2: springK,
        frictionAir: springDamping,
        restitution: springMetrics.velocity ?? 0,
        friction: springMetrics.displacement ?? 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      alert(`保存失败：${msg}`);
      return;
    }
    setLearningRecords((prev) => [saved, ...prev].slice(0, 20));
    alert('✅ 已保存弹簧振子实验记录。');
  };

  // 保存斜面摩擦实验关键参数与结果
  const addInclineRecord = async () => {
    if (!inclineMetrics) {
      alert('请先运行斜面摩擦实验后再保存记录。');
      return;
    }
    let saved;
    try {
      saved = await insertLearningRecord(currentUser.id, {
        experimentType: 'incline',
        v1i: inclineAngle,
        v2i: inclineMu,
        v1f: inclineMetrics.distance ?? 0,
        v2f: inclineInitialVelocity,
        mass1: inclineMass,
        mass2: inclineMetrics.acceleration ?? 0,
        frictionAir: inclineMu,
        restitution: inclineMetrics.normalForce ?? 0,
        friction: inclineMetrics.frictionForce ?? 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      alert(`保存失败：${msg}`);
      return;
    }
    setLearningRecords((prev) => [saved, ...prev].slice(0, 20));
    alert('✅ 已保存斜面摩擦实验记录。');
  };

  // 保存单摆实验关键参数与结果
  const addPendulumRecord = async () => {
    if (!pendulumMetrics) return alert('请先运行单摆实验后再保存记录。');
    try {
      const saved = await insertLearningRecord(currentUser.id, {
        experimentType: 'pendulum',
        v1i: pendulumInitialAngle,
        v2i: pendulumLength,
        v1f: pendulumMetrics.period ?? 0,
        v2f: pendulumMetrics.speed ?? 0,
        mass1: pendulumMass,
        mass2: pendulumDamping,
        frictionAir: pendulumMetrics.omega ?? 0,
        restitution: pendulumMetrics.totalEnergy ?? 0,
        friction: pendulumMetrics.angleDeg ?? 0,
      });
      setLearningRecords((prev) => [saved, ...prev].slice(0, 20));
      alert('✅ 已保存单摆实验记录。');
    } catch (err) {
      alert(`保存失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  // 保存抛体实验关键参数与结果
  const addProjectileRecord = async () => {
    if (!projectileMetrics) return alert('请先运行抛体运动实验后再保存记录。');
    try {
      const saved = await insertLearningRecord(currentUser.id, {
        experimentType: 'projectile',
        v1i: projectileSpeed,
        v2i: projectileAngle,
        v1f: projectileMetrics.range ?? 0,
        v2f: projectileMetrics.height ?? 0,
        mass1: projectileMetrics.time ?? 0,
        mass2: projectileMetrics.speed ?? 0,
        frictionAir: projectileDrag,
        restitution: projectileMetrics.vx ?? 0,
        friction: projectileMetrics.vy ?? 0,
      });
      setLearningRecords((prev) => [saved, ...prev].slice(0, 20));
      alert('✅ 已保存抛体运动实验记录。');
    } catch (err) {
      alert(`保存失败：${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  // 清空当前用户全部学习记录
  const clearRecords = async () => {
    if (!confirm('确定要清空所有学习记录吗？')) return;
    const ok = await clearLearningRecords(currentUser.id);
    if (!ok) {
      alert('清空失败，请检查网络与数据库权限。');
      return;
    }
    setLearningRecords([]);
    void logOperation('clear_learning_records', {});
  };

  const handleResetAndStop = () => {
    setIsRunning(false);
    if (physicsRef.current) {
      physicsRef.current.reset();
    }
    setCollisionCount(0);
    setSessionInitial(null);
    setCollisionVelLog([]);
    void logOperation('simulation_reset', {
      mass1,
      mass2,
      velocity1,
      velocity2,
      frictionAir: airResistance,
      restitution,
      friction,
    });
  };

  // 碰撞实验开始：记录当前设定速度作为本轮初始值
  const handleStart = () => {
    setSessionInitial({ v1: velocity1, v2: velocity2 });
    setIsRunning(true);
    void logOperation('simulation_start', {
      mass1,
      mass2,
      velocity1,
      velocity2,
      frictionAir: airResistance,
      restitution,
      friction,
    });
  };

  const handlePause = () => {
    setIsRunning(false);
    void logOperation('simulation_pause', {
      mass1,
      mass2,
      collisionCount,
    });
  };

  // 进入实验前先暂停所有模块，避免多个实验并行运行
  const openExperimentPage = (experimentType) => {
    setIsRunning(false);
    setSpringRunning(false);
    setInclineRunning(false);
    setPendulumRunning(false);
    setProjectileRunning(false);
    setSelectedExperiment(experimentType);
    window.localStorage.setItem(LAST_EXPERIMENT_KEY, experimentType);
    setPage('lab');
  };

  // 切换实验：停止所有模块并清除“上次实验记忆”
  const handleSwitchExperiment = () => {
    setIsRunning(false);
    setSpringRunning(false);
    setInclineRunning(false);
    setPendulumRunning(false);
    setProjectileRunning(false);
    setSelectedExperiment(null);
    window.localStorage.removeItem(LAST_EXPERIMENT_KEY);
  };

  const handleSaveNickname = async () => {
    if (!currentUser?.id) return;
    const cleaned = nicknameDraft.trim();
    if (cleaned.length < 2) {
      setAccountStatus('昵称至少 2 个字符');
      return;
    }
    if (cleaned.length > 20) {
      setAccountStatus('昵称最多 20 个字符');
      return;
    }
    setAccountSaving(true);
    setAccountStatus('');
    try {
      const profile = await updateNickname(currentUser.id, cleaned);
      setCurrentUser((prev) => (prev ? { ...prev, nickname: profile.nickname } : prev));
      setNicknameDraft(profile.nickname);
      setAccountStatus('保存成功');
      void logOperation('update_nickname', { nickname: profile.nickname });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setAccountStatus(`保存失败：${msg}`);
    } finally {
      setAccountSaving(false);
    }
  };

  const totalMomentum = (mass1 * velocity1 + mass2 * velocity2).toFixed(2);
  const recentRecords = learningRecords.slice(0, 5);
  const labRecords = learningRecords.filter((record) => (record.experimentType ?? 'collision') === 'collision');
  const springLabRecords = learningRecords.filter((record) => (record.experimentType ?? 'collision') === 'spring');
  const inclineLabRecords = learningRecords.filter((record) => (record.experimentType ?? 'collision') === 'incline');
  const pendulumLabRecords = learningRecords.filter((record) => (record.experimentType ?? 'collision') === 'pendulum');
  const projectileLabRecords = learningRecords.filter((record) => (record.experimentType ?? 'collision') === 'projectile');
  const experimentLabelMap = EXPERIMENT_MODULES.reduce((acc, module) => {
    acc[module.type] = module.title.replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, '');
    return acc;
  }, {});
  const getExperimentLabel = (type) => experimentLabelMap[type] ?? '力学实验';
  const filterOptions = [
    { value: 'all', label: '全部记录' },
    ...Object.keys(experimentLabelMap).map((type) => ({ value: type, label: getExperimentLabel(type) })),
  ];
  const recordsPageRecords =
    recordFilterType === 'all'
      ? learningRecords
      : learningRecords.filter((record) => (record.experimentType ?? 'collision') === recordFilterType);
  const displayName = currentUser?.nickname?.trim() || '未设置昵称';
  const completedModuleCount = new Set(learningRecords.map((record) => record.experimentType ?? 'collision')).size;
  const recordsByType = Object.keys(experimentLabelMap)
    .map((type) => ({
      type,
      label: getExperimentLabel(type),
      count: learningRecords.filter((record) => (record.experimentType ?? 'collision') === type).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  const topRecordTypeLabel = recordsByType[0]?.label ?? '暂无';
  const lastRecordTime = learningRecords[0]?.timestamp ?? '暂无记录';

  const renderRecordsList = (records, emptyText) => (
    <div className="records-list">
      {records.length === 0 ? (
        emptyText != null ? <p className="no-records">{emptyText}</p> : null
      ) : (
        records.map((record) => (
          <div key={record.id} className="record-item record-item-collision">
            <span className="record-time">{record.timestamp}</span>
            <span className="record-module-tag">{getExperimentLabel(record.experimentType)}</span>
            {record.experimentType === 'collision' && record.v1i != null && record.v1f != null ? (
              <>
                <span className="record-collision-line">
                  碰前 v₁={record.v1i.toFixed(2)}，v₂={record.v2i.toFixed(2)}
                </span>
                <span className="record-collision-line">
                  碰后 v₁′={record.v1f.toFixed(2)}，v₂′={record.v2f.toFixed(2)}
                </span>
                <span>
                  m₁={record.mass1}，m₂={record.mass2}
                </span>
                <span>
                  空气阻力={record.frictionAir?.toFixed(3) ?? '—'}，弹力系数={record.restitution?.toFixed(2) ?? '—'}，摩擦系数=
                  {record.friction?.toFixed(2) ?? '—'}
                </span>
              </>
            ) : record.experimentType === 'spring' ? (
              <>
                <span>初始位移 x₀={record.v1i?.toFixed(3) ?? '—'} m，质量 m={record.mass1?.toFixed(2) ?? '—'} kg</span>
                <span>劲度系数 k={record.mass2?.toFixed(2) ?? '—'} N/m，阻尼 c={record.frictionAir?.toFixed(3) ?? '—'}</span>
                <span>理论周期 T={record.v1f?.toFixed(3) ?? '—'} s，总机械能 E={record.v2f?.toFixed(3) ?? '—'} J</span>
                <span>当前速度={record.restitution?.toFixed(3) ?? '—'} m/s，当前位移={record.friction?.toFixed(3) ?? '—'} m</span>
              </>
            ) : record.experimentType === 'incline' ? (
              <>
                <span>倾角 θ={record.v1i?.toFixed(2) ?? '—'}°，摩擦系数 μ={record.v2i?.toFixed(3) ?? '—'}</span>
                <span>质量 m={record.mass1?.toFixed(2) ?? '—'} kg</span>
                <span>位移 s={record.v1f?.toFixed(3) ?? '—'} m，初速度 v₀={record.v2f?.toFixed(2) ?? '—'} m/s，加速度 a={record.mass2?.toFixed(3) ?? '—'} m/s²</span>
                <span>支持力 N={record.restitution?.toFixed(2) ?? '—'} N，摩擦力 f={record.friction?.toFixed(2) ?? '—'} N</span>
              </>
            ) : record.experimentType === 'pendulum' ? (
              <>
                <span>初始角 θ₀={record.v1i?.toFixed(2) ?? '—'}°，摆长 L={record.v2i?.toFixed(2) ?? '—'} m</span>
                <span>周期 T={record.v1f?.toFixed(3) ?? '—'} s，线速度 v={record.v2f?.toFixed(3) ?? '—'} m/s</span>
                <span>摆球质量 m={record.mass1?.toFixed(2) ?? '—'} kg，阻尼={record.mass2?.toFixed(3) ?? '—'}</span>
                <span>角速度 ω={record.frictionAir?.toFixed(3) ?? '—'} rad/s，总能量 E={record.restitution?.toFixed(3) ?? '—'} J</span>
              </>
            ) : record.experimentType === 'projectile' ? (
              <>
                <span>初速度 v₀={record.v1i?.toFixed(2) ?? '—'} m/s，发射角 θ={record.v2i?.toFixed(2) ?? '—'}°</span>
                <span>射程 R={record.v1f?.toFixed(3) ?? '—'} m，最高点 h={record.v2f?.toFixed(3) ?? '—'} m</span>
                <span>飞行时间 t={record.mass1?.toFixed(3) ?? '—'} s，末速度={record.mass2?.toFixed(3) ?? '—'} m/s</span>
                <span>阻力={record.frictionAir?.toFixed(3) ?? '—'}，vx={record.restitution?.toFixed(3) ?? '—'}，vy={record.friction?.toFixed(3) ?? '—'}</span>
              </>
            ) : (
              <>
                <span>v₁={record.velocity1?.toFixed(1) ?? '—'}</span>
                <span>v₂={record.velocity2?.toFixed(1) ?? '—'}</span>
                <span>m₁={record.mass1}</span>
                <span>m₂={record.mass2}</span>
                {record.collisionCount != null && <span>碰撞{record.collisionCount}次</span>}
              </>
            )}
          </div>
        ))
      )}
    </div>
  );

  if (!authReady) {
    return (
      <div className="login-container">
        <div className="login-card">
          <p className="auth-error">正在检查登录状态…</p>
        </div>
      </div>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>力学实验教学平台</h1>
          <p style={{ textAlign: 'left', lineHeight: 1.6 }}>
            请配置 Supabase：在项目根目录复制 <code>.env.example</code> 为 <code>.env</code>，填入{' '}
            <code>VITE_SUPABASE_URL</code> 与 <code>VITE_SUPABASE_ANON_KEY</code>（见 Supabase 控制台 Settings →
            API），并在 SQL Editor 中执行 <code>supabase/setup.sql</code> 后重启开发服务器。
          </p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>力学实验教学平台</h1>
          <div className="login-icon">⚛️</div>
          <div className="auth-tabs">
            <button
              type="button"
              className={authMode === 'login' ? 'active' : ''}
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
              }}
            >
              登录
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'active' : ''}
              onClick={() => {
                setAuthMode('register');
                setAuthError('');
              }}
            >
              注册
            </button>
          </div>
          <div className="auth-form">
            <input
              type="email"
              placeholder="邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="auth-input"
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="密码（至少 6 位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input"
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
            />
            {authMode === 'register' && (
              <input
                type="password"
                placeholder="确认密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="auth-input"
                autoComplete="new-password"
              />
            )}
            {authError && <div className="auth-error">{authError}</div>}
            <button
              type="button"
              onClick={authMode === 'login' ? handleLogin : handleRegister}
              className="login-btn"
            >
              {authMode === 'login' ? '登录' : '注册'}
            </button>
          </div>
          <div className="login-demo">
            <p>📖 力学实验教学 · 支持多实验场景扩展</p>
            <p>⚡ Matter.js 物理引擎 + Konva 画布 · 碰撞与动量过程可视化</p>
            <p>🔐 账户与操作记录由 Supabase 托管</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-brand">
          <h1>力学实验教学平台</h1>
        </div>
        <div className="user-info">
          <div className="user-details">
            <span className="user-name">👤 {displayName}</span>
            {currentUser?.createdAt && (
              <span className="user-meta">注册 {new Date(currentUser.createdAt).toLocaleDateString()}</span>
            )}
          </div>
          <button type="button" onClick={handleLogout} className="logout-btn">
            退出登录
          </button>
        </div>
      </header>

      <nav className="top-nav">
        <button type="button" className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}>
          首页
        </button>
        <button type="button" className={page === 'lab' ? 'active' : ''} onClick={() => setPage('lab')}>
          实验模块
        </button>
        <button type="button" className={page === 'records' ? 'active' : ''} onClick={() => setPage('records')}>
          学习记录
        </button>
        <button type="button" className={page === 'account' ? 'active' : ''} onClick={() => setPage('account')}>
          账户管理
        </button>
      </nav>

      {page === 'home' && (
        <div className="home-layout">
          <section className="home-section">
            <div className="home-section-head">
              <h2>力学实验模块</h2>
            </div>
            <div className="module-grid">
              {EXPERIMENT_MODULES.map((module) => {
                const isOnline = module.status === 'online';
                return (
                  <article key={module.type} className={`module-card ${isOnline ? '' : 'module-card-disabled'}`}>
                    <h3>{module.title}</h3>
                    <button type="button" disabled={!isOnline} onClick={isOnline ? () => openExperimentPage(module.type) : undefined}>
                      {isOnline ? '进入模块' : '即将上线'}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="home-section records-section">
            <div className="records-header">
              <h3>📚 近期学习记录</h3>
              <div className="records-actions">
                <button type="button" className="secondary-btn" onClick={() => setPage('records')}>
                  查看全部
                </button>
                {learningRecords.length > 0 && (
                  <button type="button" className="clear-btn" onClick={clearRecords}>
                    清空记录
                  </button>
                )}
              </div>
            </div>
            <div className="records-list">
              {recentRecords.length === 0 ? null : (
                recentRecords.map((record) => (
                  <div key={record.id} className="record-item record-item-collision">
                    <span className="record-time">{record.timestamp}</span>
                    <span className="record-module-tag">{getExperimentLabel(record.experimentType)}</span>
                    {record.experimentType === 'collision' ? (
                      <>
                        <span className="record-collision-line">
                          碰前 v₁={record.v1i.toFixed(2)}，v₂={record.v2i.toFixed(2)}
                        </span>
                        <span className="record-collision-line">
                          碰后 v₁′={record.v1f.toFixed(2)}，v₂′={record.v2f.toFixed(2)}
                        </span>
                      </>
                    ) : record.experimentType === 'spring' ? (
                      <span>弹簧：x₀={record.v1i?.toFixed(3)}m，T={record.v1f?.toFixed(3)}s，E={record.v2f?.toFixed(3)}J</span>
                    ) : record.experimentType === 'incline' ? (
                      <span>
                        斜面：θ={record.v1i?.toFixed(1)}°，μ={record.v2i?.toFixed(2)}，v₀={record.v2f?.toFixed(2)}m/s，a={record.mass2?.toFixed(2)}m/s²
                      </span>
                    ) : (
                      <span>实验记录已保存。</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="home-section dashboard-section">
            <div className="home-section-head">
              <h2>学习概览</h2>
            </div>
            <div className="dashboard-grid">
              <article className="dashboard-card">
                <span className="dashboard-label">累计记录</span>
                <strong>{learningRecords.length}</strong>
                <p>最近一次：{lastRecordTime}</p>
              </article>
              <article className="dashboard-card">
                <span className="dashboard-label">已覆盖模块</span>
                <strong>{completedModuleCount} / {onlineModules.length}</strong>
              </article>
              <article className="dashboard-card">
                <span className="dashboard-label">最高活跃模块</span>
                <strong>{topRecordTypeLabel}</strong>
              </article>
            </div>
          </section>
        </div>
      )}

      {page === 'lab' && !selectedExperiment && (
        <section className="lab-selector-section">
          <div className="records-header">
            <h3>🧭 选择实验模块</h3>
            <div className="records-actions">
              <button type="button" className="secondary-btn" onClick={() => setPage('home')}>
                返回首页
              </button>
            </div>
          </div>
          <p className="lab-selector-tip">
            首次进入请先选择实验；选择后系统会记忆并在下次自动直达该实验。
          </p>
          <div className="module-grid">
            {onlineModules.map((module) => (
              <article key={module.type} className="module-card">
                <div className="module-state">{module.statusLabel}</div>
                <h3>{module.title}</h3>
                <p>{module.description}</p>
                <button type="button" onClick={() => openExperimentPage(module.type)}>
                  进入该实验
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {page === 'lab' && selectedExperiment === 'collision' && (
        <>
          <div className="main-content">
            <div className="canvas-section">
              <div className="section-title">
                <span>⚡ 动量守恒（碰撞）实验</span>
                <div className="title-right">
                  <span className="collision-badge">碰撞次数: {collisionCount}</span>
                  <span className={`running-status ${isRunning ? 'running' : 'stopped'}`}>
                    {isRunning ? '● 运动中' : '● 已暂停'}
                  </span>
                </div>
              </div>

              <div className="velocity-mode-bar">
                <span className="velocity-mode-label">初速度设定方式</span>
                <div className="velocity-mode-switch">
                  <button
                    type="button"
                    className={velocitySetMode === 'slider' ? 'active' : ''}
                    onClick={() => setVelocitySetMode('slider')}
                  >
                    滑动条
                  </button>
                  <button type="button" className={velocitySetMode === 'drag' ? 'active' : ''} onClick={() => setVelocitySetMode('drag')}>
                    画布拖拽
                  </button>
                </div>
                <p className="velocity-mode-hint">
                  {velocitySetMode === 'slider'
                    ? '用下方滑动条调节 v₁、v₂；画布上小球不可拖拽设速。'
                    : '暂停时按住左键水平拖动小球（仅左右移动），松手或触墙/触另一球后按位移赋速并自动开始运动，无需再点「开始」。下方滑块已锁定。'}
                </p>
              </div>

              <div className="physics-canvas-shell">
                <PhysicsScene
                  ref={physicsRef}
                  velocity1={velocity1}
                  velocity2={velocity2}
                  mass1={mass1}
                  mass2={mass2}
                  frictionAir={airResistance}
                  restitution={restitution}
                  friction={friction}
                  isRunning={isRunning}
                  velocitySetMode={velocitySetMode}
                  onBallCollisionDetail={handleCollisionVel}
                  onCollision={setCollisionCount}
                  onMomentumChange={setCurrentMomentum}
                  onVelocityChange={(ball, v) => (ball === 'A' ? setVelocity1(v) : setVelocity2(v))}
                  onDragCommitRun={handleDragCommitRun}
                />
              </div>

              <div className="momentum-display">
                <span>当前总动量: {currentMomentum} kg·m/s</span>
                <span className="momentum-sep">|</span>
                <span>设定值: {totalMomentum} kg·m/s</span>
              </div>

              {(sessionInitial || collisionVelLog.length > 0) && (
                <div className="velocity-readout-panel">
                  {sessionInitial && (
                    <div className="readout-block">
                      <strong>本轮初速度</strong>（开始运动时 / 拖拽结束自动开始时）：
                      <span className="readout-values">
                        v₁₀ = {sessionInitial.v1.toFixed(2)} m/s，v₂₀ = {sessionInitial.v2.toFixed(2)} m/s
                      </span>
                    </div>
                  )}
                  {collisionVelLog.length > 0 && (
                    <div className="readout-block collision-log">
                      <strong>两球碰撞速度记录</strong>
                      <ul className="collision-vel-list">
                        {collisionVelLog.map((row, i) => (
                          <li key={row.id}>
                            <span className="log-idx">第 {collisionVelLog.length - i} 次</span>
                            <span className="log-vel">
                              碰前 v₁={row.v1i.toFixed(2)}，v₂={row.v2i.toFixed(2)}
                            </span>
                            <span className="log-arrow">→</span>
                            <span className="log-vel">
                              碰后 v₁′={row.v1f.toFixed(2)}，v₂′={row.v2f.toFixed(2)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="resource-section">
              <div className="resource-tabs">
                <button type="button" className={activeTab === 'theory' ? 'active' : ''} onClick={() => setActiveTab('theory')}>
                  📖 动量守恒
                </button>
                <button type="button" className={activeTab === 'guide' ? 'active' : ''} onClick={() => setActiveTab('guide')}>
                  🎮 操作指南
                </button>
                <button type="button" className={activeTab === 'exercise' ? 'active' : ''} onClick={() => setActiveTab('exercise')}>
                  ✏️ 思考练习
                </button>
              </div>
              <div className="resource-content">
                {activeTab === 'theory' && (
                  <div>
                    <h3>动量守恒定律</h3>
                    <div className="formula">m₁v₁ + m₂v₂ = m₁v₁&apos; + m₂v₂&apos;</div>
                    <p>一个系统不受外力或所受外力之和为零，系统的总动量保持不变。</p>
                    <div className="key-points">
                      <h4>📌 核心要点：</h4>
                      <ul>
                        <li>动量是矢量，有方向（正负号表示方向）</li>
                        <li>碰撞前后总动量保持不变</li>
                        <li>
                          本实验中：总动量 = {mass1}×{velocity1.toFixed(1)} + {mass2}×{velocity2.toFixed(1)} ={' '}
                          <strong>{totalMomentum}</strong>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}
                {activeTab === 'guide' && (
                  <div>
                    <h3>🎮 操作指南</h3>
                    <div className="guide-steps">
                      <div className="step">
                        🎈 画布上方切换<strong>滑动条</strong>或<strong>画布拖拽</strong>：拖拽模式下<strong>左键按住</strong>小球仅可<strong>水平拖动</strong>，松手或触墙/触球后<strong>自动赋速并开始运动</strong>（滑块锁定）；滑动条模式仍需点「开始运动」
                      </div>
                      <div className="step">⚖️ 调节小球A/B的<strong>质量</strong>，观察半径和动量变化</div>
                      <div className="step">▶️ 点击<strong>开始运动</strong>，小球按设定速度运动</div>
                      <div className="step">💥 小球会<strong>真实碰撞</strong>，遵守动量守恒</div>
                      <div className="step">⏸️ 点击<strong>暂停</strong>，小球立即停止</div>
                      <div className="step">🔄 点击<strong>重置</strong>让小球回到原位并停止</div>
                      <div className="step">
                        📝 两球相撞后点击<strong>记录实验</strong>，将<strong>本轮第一次碰撞</strong>的碰前/碰后速度保存到你的账户（Supabase）；同一轮若相撞多次，仍记第一次
                      </div>
                    </div>
                    <div className="tip">
                      💡 <strong>小贴士：</strong>绿色箭头向右（正速度），红色箭头向左（负速度）
                      <br />
                      💡 先设置好速度和质量，再点击&quot;开始运动&quot;！
                    </div>
                  </div>
                )}
                {activeTab === 'exercise' && (
                  <div>
                    <h3>✏️ 思考练习</h3>
                    <div className="question">
                      <p>
                        <strong>问题1：</strong>当两个小球质量相等，一个静止另一个以v速度撞击，碰撞后会发生什么？
                      </p>
                      <details>
                        <summary>查看答案</summary>
                        <p>第一个球停止，第二个球以v速度运动</p>
                      </details>
                    </div>
                    <div className="question">
                      <p>
                        <strong>问题2：</strong>如何让小球A碰撞后反向弹回？
                      </p>
                      <details>
                        <summary>查看答案</summary>
                        <p>让小球A的质量小于小球B，且小球B静止</p>
                      </details>
                    </div>
                    <div className="question">
                      <p>
                        <strong>问题3：</strong>为什么需要点击&quot;开始运动&quot;小球才会动？
                      </p>
                      <details>
                        <summary>查看答案</summary>
                        <p>这样可以先设置好参数，观察设定状态，再开始实验对比结果</p>
                      </details>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="control-section">
            <div className="control-panel">
              <div className="control-group">
                <h4>🎈 小球A（红色）</h4>
                <div className="control-item">
                  <label>
                    初速度 v₁: {velocity1.toFixed(1)} m/s
                    {velocitySetMode === 'drag' && <span className="readonly-tag">拖拽模式锁定</span>}
                  </label>
                  <input
                    type="range"
                    min="-5"
                    max="5"
                    step="0.1"
                    value={velocity1}
                    disabled={velocitySetMode === 'drag'}
                    onChange={(e) => setVelocity1(parseFloat(e.target.value))}
                  />
                  <div className="button-group">
                    <button type="button" disabled={velocitySetMode === 'drag'} onClick={() => setVelocity1((v) => Math.min(5, v + 0.5))}>
                      +0.5
                    </button>
                    <button type="button" disabled={velocitySetMode === 'drag'} onClick={() => setVelocity1((v) => Math.max(-5, v - 0.5))}>
                      -0.5
                    </button>
                    <button type="button" disabled={velocitySetMode === 'drag'} onClick={() => setVelocity1(0)}>
                      归零
                    </button>
                  </div>
                </div>
                <div className="control-item">
                  <label>质量 m₁: {mass1} kg</label>
                  <input type="range" min="10" max="50" step="1" value={mass1} onChange={(e) => setMass1(parseFloat(e.target.value))} />
                  <div className="button-group">
                    <button type="button" onClick={() => setMass1((m) => Math.min(50, m + 5))}>
                      +5
                    </button>
                    <button type="button" onClick={() => setMass1((m) => Math.max(10, m - 5))}>
                      -5
                    </button>
                  </div>
                </div>
              </div>

              <div className="control-group">
                <h4>💎 小球B（青色）</h4>
                <div className="control-item">
                  <label>
                    初速度 v₂: {velocity2.toFixed(1)} m/s
                    {velocitySetMode === 'drag' && <span className="readonly-tag">拖拽模式锁定</span>}
                  </label>
                  <input
                    type="range"
                    min="-5"
                    max="5"
                    step="0.1"
                    value={velocity2}
                    disabled={velocitySetMode === 'drag'}
                    onChange={(e) => setVelocity2(parseFloat(e.target.value))}
                  />
                  <div className="button-group">
                    <button type="button" disabled={velocitySetMode === 'drag'} onClick={() => setVelocity2((v) => Math.min(5, v + 0.5))}>
                      +0.5
                    </button>
                    <button type="button" disabled={velocitySetMode === 'drag'} onClick={() => setVelocity2((v) => Math.max(-5, v - 0.5))}>
                      -0.5
                    </button>
                    <button type="button" disabled={velocitySetMode === 'drag'} onClick={() => setVelocity2(0)}>
                      归零
                    </button>
                  </div>
                </div>
                <div className="control-item">
                  <label>质量 m₂: {mass2} kg</label>
                  <input type="range" min="10" max="50" step="1" value={mass2} onChange={(e) => setMass2(parseFloat(e.target.value))} />
                  <div className="button-group">
                    <button type="button" onClick={() => setMass2((m) => Math.min(50, m + 5))}>
                      +5
                    </button>
                    <button type="button" onClick={() => setMass2((m) => Math.max(10, m - 5))}>
                      -5
                    </button>
                  </div>
                </div>
              </div>

              <div className="control-group">
                <h4>🧪 实验环境参数</h4>
                <div className="control-item">
                  <label>空气阻力系数: {airResistance.toFixed(3)}</label>
                  <input
                    type="range"
                    min="0"
                    max="0.02"
                    step="0.001"
                    value={airResistance}
                    onChange={(e) => setAirResistance(parseFloat(e.target.value))}
                  />
                </div>
                <div className="control-item">
                  <label>弹力系数: {restitution.toFixed(2)}</label>
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.01"
                    value={restitution}
                    onChange={(e) => setRestitution(parseFloat(e.target.value))}
                  />
                </div>
                <div className="control-item">
                  <label>摩擦系数: {friction.toFixed(2)}</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={friction}
                    onChange={(e) => setFriction(parseFloat(e.target.value))}
                  />
                </div>
              </div>

              <div className="control-actions">
                {!isRunning ? (
                  <button type="button" className="action-btn start-btn" onClick={handleStart}>
                    ▶️ 开始运动
                  </button>
                ) : (
                  <button type="button" className="action-btn pause-btn" onClick={handlePause}>
                    ⏸️ 暂停
                  </button>
                )}
                <button type="button" className="action-btn reset-btn" onClick={handleResetAndStop}>
                  🔄 重置
                </button>
                <button type="button" className="action-btn record-btn" onClick={addRecord}>
                  📝 记录实验
                </button>
                <button type="button" className="action-btn ghost-btn" onClick={() => setPage('records')}>
                  📚 查看全部记录
                </button>
                <button type="button" className="action-btn ghost-btn" onClick={handleSwitchExperiment}>
                  🔀 切换实验
                </button>
              </div>
            </div>
          </div>

          <div className="records-section">
            <div className="records-header">
              <h3>📚 模块内学习记录（动量守恒实验）</h3>
              <div className="records-actions">
                {learningRecords.length > 0 && (
                  <button type="button" className="clear-btn" onClick={clearRecords}>
                    清空记录
                  </button>
                )}
              </div>
            </div>
            {renderRecordsList(
              labRecords,
              <>
                当前模块暂无记录。运行实验使两球相撞后，点击「记录实验」保存<strong>本轮第一次碰撞</strong>的碰前/碰后速度。
              </>
            )}
          </div>
        </>
      )}

      {page === 'lab' && selectedExperiment === 'spring' && (
        <>
          <div className="main-content">
            <div className="canvas-section">
              <div className="section-title">
                <span>🌀 弹簧振子实验</span>
                <div className="title-right">
                  <span className={`running-status ${springRunning ? 'running' : 'stopped'}`}>
                    {springRunning ? '● 振动中' : '● 已暂停'}
                  </span>
                </div>
              </div>
              <div className="physics-canvas-shell">
                <SpringOscillatorScene
                  mass={springMass}
                  springK={springK}
                  damping={springDamping}
                  initialDisplacement={springInitialDisp}
                  resetToken={springResetToken}
                  isRunning={springRunning}
                  onMetricsChange={setSpringMetrics}
                />
              </div>
              <div className="momentum-display">
                <span>理论周期: {springMetrics?.period?.toFixed(3) ?? '0.000'} s</span>
                <span className="momentum-sep">|</span>
                <span>总机械能: {springMetrics?.totalEnergy?.toFixed(3) ?? '0.000'} J</span>
              </div>
            </div>
            <div className="resource-section">
              <div className="resource-content">
                <h3>简谐振动关系</h3>
                <div className="formula">T = 2π√(m / k), E = 1/2 kx² + 1/2 mv²</div>
                <p>调节质量和劲度系数，观察周期与能量变化。阻尼越大，振幅衰减越快。</p>
              </div>
            </div>
          </div>
          <div className="control-section">
            <div className="control-panel">
              <div className="control-group">
                <h4>参数设置</h4>
                <div className="control-item">
                  <label>质量 m: {springMass.toFixed(1)} kg</label>
                  <input type="range" min="0.5" max="5" step="0.1" value={springMass} onChange={(e) => setSpringMass(parseFloat(e.target.value))} />
                </div>
                <div className="control-item">
                  <label>劲度系数 k: {springK.toFixed(1)} N/m</label>
                  <input type="range" min="5" max="50" step="0.5" value={springK} onChange={(e) => setSpringK(parseFloat(e.target.value))} />
                </div>
                <div className="control-item">
                  <label>阻尼系数 c: {springDamping.toFixed(2)}</label>
                  <input
                    type="range"
                    min="0"
                    max="1.2"
                    step="0.02"
                    value={springDamping}
                    onChange={(e) => setSpringDamping(parseFloat(e.target.value))}
                  />
                </div>
                <div className="control-item">
                  <label>初始位移 x₀: {springInitialDisp.toFixed(2)} m</label>
                  <input
                    type="range"
                    min="-0.45"
                    max="0.45"
                    step="0.01"
                    value={springInitialDisp}
                    onChange={(e) => setSpringInitialDisp(parseFloat(e.target.value))}
                  />
                </div>
              </div>
              <div className="control-actions">
                {!springRunning ? (
                  <button type="button" className="action-btn start-btn" onClick={() => setSpringRunning(true)}>
                    ▶️ 开始振动
                  </button>
                ) : (
                  <button type="button" className="action-btn pause-btn" onClick={() => setSpringRunning(false)}>
                    ⏸️ 暂停
                  </button>
                )}
                <button
                  type="button"
                  className="action-btn reset-btn"
                  onClick={() => {
                    setSpringRunning(false);
                    setSpringResetToken((n) => n + 1);
                  }}
                >
                  🔄 重置
                </button>
                <button type="button" className="action-btn record-btn" onClick={addSpringRecord}>
                  📝 记录实验
                </button>
                <button type="button" className="action-btn ghost-btn" onClick={handleSwitchExperiment}>
                  🔀 切换实验
                </button>
              </div>
            </div>
          </div>
          <div className="records-section">
            <div className="records-header">
              <h3>📚 模块内学习记录（弹簧振子）</h3>
            </div>
            {renderRecordsList(springLabRecords, '当前模块暂无记录。')}
          </div>
        </>
      )}

      {page === 'lab' && selectedExperiment === 'incline' && (
        <>
          <div className="main-content">
            <div className="canvas-section">
              <div className="section-title">
                <span>🧱 斜面摩擦实验</span>
                <div className="title-right">
                  <span className={`running-status ${inclineRunning ? 'running' : 'stopped'}`}>
                    {inclineRunning ? '● 运动中' : '● 已暂停'}
                  </span>
                </div>
              </div>
              <div className="physics-canvas-shell">
                <InclineFrictionScene
                  mass={inclineMass}
                  angleDeg={inclineAngle}
                  frictionMu={inclineMu}
                  initialVelocityMps={inclineInitialVelocity}
                  resetToken={inclineResetToken}
                  isRunning={inclineRunning}
                  onMetricsChange={setInclineMetrics}
                  onReachEnd={() => setInclineRunning(false)}
                />
              </div>
              <div className="momentum-display">
                <span>初速度 v₀: {inclineInitialVelocity.toFixed(2)} m/s</span>
                <span className="momentum-sep">|</span>
                <span>加速度: {inclineMetrics?.acceleration?.toFixed(3) ?? '0.000'} m/s²</span>
                <span className="momentum-sep">|</span>
                <span>位移: {inclineMetrics?.distance?.toFixed(3) ?? '0.000'} m</span>
              </div>
            </div>
            <div className="resource-section">
              <div className="resource-content">
                <h3>斜面受力分解</h3>
                <div className="formula">a = g(sinθ - μcosθ)</div>
                <p>
                  初速度 v₀ 沿斜面切向：向下为正、向上为负；点击「开始」时一次性赋给滑块。当 μcosθ 大于 sinθ 且 v₀=0 时，物块可能静止；有初速度时仍可能上滑或下滑。
                </p>
              </div>
            </div>
          </div>
          <div className="control-section">
            <div className="control-panel">
              <div className="control-group">
                <h4>参数设置</h4>
                <div className="control-item">
                  <label>质量 m: {inclineMass.toFixed(1)} kg</label>
                  <input type="range" min="0.5" max="8" step="0.1" value={inclineMass} onChange={(e) => setInclineMass(parseFloat(e.target.value))} />
                </div>
                <div className="control-item">
                  <label>倾角 θ: {inclineAngle.toFixed(1)}°</label>
                  <input type="range" min="5" max="60" step="0.5" value={inclineAngle} onChange={(e) => setInclineAngle(parseFloat(e.target.value))} />
                </div>
                <div className="control-item">
                  <label>摩擦系数 μ: {inclineMu.toFixed(2)}</label>
                  <input type="range" min="0" max="0.9" step="0.01" value={inclineMu} onChange={(e) => setInclineMu(parseFloat(e.target.value))} />
                </div>
                <div className="control-item">
                  <label>
                    初速度 v₀（沿斜面）: {inclineInitialVelocity.toFixed(1)} m/s
                    <span className="readonly-tag" style={{ marginLeft: 8 }}>
                      向下为正
                    </span>
                  </label>
                  <input
                    type="range"
                    min="-4"
                    max="10"
                    step="0.1"
                    value={inclineInitialVelocity}
                    onChange={(e) => setInclineInitialVelocity(parseFloat(e.target.value))}
                  />
                </div>
              </div>
              <div className="control-actions">
                {!inclineRunning ? (
                  <button type="button" className="action-btn start-btn" onClick={() => setInclineRunning(true)}>
                    ▶️ 开始下滑
                  </button>
                ) : (
                  <button type="button" className="action-btn pause-btn" onClick={() => setInclineRunning(false)}>
                    ⏸️ 暂停
                  </button>
                )}
                <button
                  type="button"
                  className="action-btn reset-btn"
                  onClick={() => {
                    setInclineRunning(false);
                    setInclineResetToken((n) => n + 1);
                  }}
                >
                  🔄 重置
                </button>
                <button type="button" className="action-btn record-btn" onClick={addInclineRecord}>
                  📝 记录实验
                </button>
                <button type="button" className="action-btn ghost-btn" onClick={handleSwitchExperiment}>
                  🔀 切换实验
                </button>
              </div>
            </div>
          </div>
          <div className="records-section">
            <div className="records-header">
              <h3>📚 模块内学习记录（斜面摩擦）</h3>
            </div>
            {renderRecordsList(inclineLabRecords, '当前模块暂无记录。')}
          </div>
        </>
      )}

      {page === 'lab' && selectedExperiment === 'pendulum' && (
        <>
          <div className="main-content">
            <div className="canvas-section">
              <div className="section-title">
                <span>🪀 单摆实验</span>
                <div className="title-right">
                  <span className={`running-status ${pendulumRunning ? 'running' : 'stopped'}`}>
                    {pendulumRunning ? '● 摆动中' : '● 已暂停'}
                  </span>
                </div>
              </div>
              <div className="physics-canvas-shell">
                <PendulumScene
                  length={pendulumLength}
                  mass={pendulumMass}
                  damping={pendulumDamping}
                  initialAngleDeg={pendulumInitialAngle}
                  isRunning={pendulumRunning}
                  resetToken={pendulumResetToken}
                  onMetricsChange={setPendulumMetrics}
                />
              </div>
              <div className="momentum-display">
                <span>周期: {pendulumMetrics?.period?.toFixed(3) ?? '0.000'} s</span>
                <span className="momentum-sep">|</span>
                <span>角度: {pendulumMetrics?.angleDeg?.toFixed(2) ?? '0.00'}°</span>
                <span className="momentum-sep">|</span>
                <span>总能量: {pendulumMetrics?.totalEnergy?.toFixed(3) ?? '0.000'} J</span>
              </div>
            </div>
            <div className="resource-section">
              <div className="resource-content">
                <h3>单摆近似规律</h3>
                <div className="formula">T = 2π√(L/g)</div>
                <p>小角度下周期仅与摆长有关。增大阻尼会导致振幅随时间衰减。</p>
              </div>
            </div>
          </div>
          <div className="control-section">
            <div className="control-panel">
              <div className="control-group">
                <h4>参数设置</h4>
                <div className="control-item">
                  <label>摆长 L: {pendulumLength.toFixed(2)} m</label>
                  <input type="range" min="0.5" max="2.2" step="0.01" value={pendulumLength} onChange={(e) => setPendulumLength(parseFloat(e.target.value))} />
                </div>
                <div className="control-item">
                  <label>摆球质量 m: {pendulumMass.toFixed(2)} kg</label>
                  <input type="range" min="0.4" max="4" step="0.05" value={pendulumMass} onChange={(e) => setPendulumMass(parseFloat(e.target.value))} />
                </div>
                <div className="control-item">
                  <label>阻尼系数: {pendulumDamping.toFixed(3)}</label>
                  <input type="range" min="0" max="0.2" step="0.002" value={pendulumDamping} onChange={(e) => setPendulumDamping(parseFloat(e.target.value))} />
                </div>
                <div className="control-item">
                  <label>初始角度: {pendulumInitialAngle.toFixed(1)}°</label>
                  <input
                    type="range"
                    min="-55"
                    max="55"
                    step="1"
                    value={pendulumInitialAngle}
                    onChange={(e) => setPendulumInitialAngle(parseFloat(e.target.value))}
                  />
                </div>
              </div>
              <div className="control-actions">
                {!pendulumRunning ? (
                  <button type="button" className="action-btn start-btn" onClick={() => setPendulumRunning(true)}>
                    ▶️ 开始摆动
                  </button>
                ) : (
                  <button type="button" className="action-btn pause-btn" onClick={() => setPendulumRunning(false)}>
                    ⏸️ 暂停
                  </button>
                )}
                <button type="button" className="action-btn reset-btn" onClick={() => { setPendulumRunning(false); setPendulumResetToken((n) => n + 1); }}>
                  🔄 重置
                </button>
                <button type="button" className="action-btn record-btn" onClick={addPendulumRecord}>
                  📝 记录实验
                </button>
                <button type="button" className="action-btn ghost-btn" onClick={handleSwitchExperiment}>
                  🔀 切换实验
                </button>
              </div>
            </div>
          </div>
          <div className="records-section">
            <div className="records-header"><h3>📚 模块内学习记录（单摆）</h3></div>
            {renderRecordsList(pendulumLabRecords, '当前模块暂无记录。')}
          </div>
        </>
      )}

      {page === 'lab' && selectedExperiment === 'projectile' && (
        <>
          <div className="main-content">
            <div className="canvas-section">
              <div className="section-title">
                <span>🚀 抛体运动实验</span>
                <div className="title-right">
                  <span className={`running-status ${projectileRunning ? 'running' : 'stopped'}`}>
                    {projectileRunning ? '● 飞行中' : '● 已暂停'}
                  </span>
                </div>
              </div>
              <div className="physics-canvas-shell">
                <ProjectileScene
                  speed={projectileSpeed}
                  angleDeg={projectileAngle}
                  drag={projectileDrag}
                  isRunning={projectileRunning}
                  resetToken={projectileResetToken}
                  onMetricsChange={setProjectileMetrics}
                  onReachGround={() => setProjectileRunning(false)}
                />
              </div>
              <div className="momentum-display">
                <span>射程: {projectileMetrics?.range?.toFixed(3) ?? '0.000'} m</span>
                <span className="momentum-sep">|</span>
                <span>高度: {projectileMetrics?.height?.toFixed(3) ?? '0.000'} m</span>
                <span className="momentum-sep">|</span>
                <span>飞行时间: {projectileMetrics?.time?.toFixed(3) ?? '0.000'} s</span>
              </div>
            </div>
            <div className="resource-section">
              <div className="resource-content">
                <h3>抛体分解</h3>
                <div className="formula">x = v0 cosθ · t, y = v0 sinθ · t - 1/2 gt²</div>
                <p>增大发射角可提高最高点；接近 45° 时无阻力射程通常更大。</p>
              </div>
            </div>
          </div>
          <div className="control-section">
            <div className="control-panel">
              <div className="control-group">
                <h4>参数设置</h4>
                <div className="control-item">
                  <label>初速度 v₀: {projectileSpeed.toFixed(1)} m/s</label>
                  <input type="range" min="6" max="32" step="0.2" value={projectileSpeed} onChange={(e) => setProjectileSpeed(parseFloat(e.target.value))} />
                </div>
                <div className="control-item">
                  <label>发射角 θ: {projectileAngle.toFixed(1)}°</label>
                  <input type="range" min="10" max="80" step="0.5" value={projectileAngle} onChange={(e) => setProjectileAngle(parseFloat(e.target.value))} />
                </div>
                <div className="control-item">
                  <label>空气阻力: {projectileDrag.toFixed(3)}</label>
                  <input type="range" min="0" max="0.12" step="0.002" value={projectileDrag} onChange={(e) => setProjectileDrag(parseFloat(e.target.value))} />
                </div>
              </div>
              <div className="control-actions">
                {!projectileRunning ? (
                  <button type="button" className="action-btn start-btn" onClick={() => setProjectileRunning(true)}>
                    ▶️ 发射
                  </button>
                ) : (
                  <button type="button" className="action-btn pause-btn" onClick={() => setProjectileRunning(false)}>
                    ⏸️ 暂停
                  </button>
                )}
                <button type="button" className="action-btn reset-btn" onClick={() => { setProjectileRunning(false); setProjectileResetToken((n) => n + 1); }}>
                  🔄 重置
                </button>
                <button type="button" className="action-btn record-btn" onClick={addProjectileRecord}>
                  📝 记录实验
                </button>
                <button type="button" className="action-btn ghost-btn" onClick={handleSwitchExperiment}>
                  🔀 切换实验
                </button>
              </div>
            </div>
          </div>
          <div className="records-section">
            <div className="records-header"><h3>📚 模块内学习记录（抛体）</h3></div>
            {renderRecordsList(projectileLabRecords, '当前模块暂无记录。')}
          </div>
        </>
      )}

      {page === 'records' && (
        <div className="records-page">
          <div className="records-section">
            <div className="records-header">
              <h3>📚 学习记录中心（近期实验模拟）</h3>
              <div className="records-actions">
                <label className="records-filter">
                  <span>筛选</span>
                  <select value={recordFilterType} onChange={(e) => setRecordFilterType(e.target.value)}>
                    {filterOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="secondary-btn" onClick={() => setPage('lab')}>
                  去实验模块
                </button>
                {learningRecords.length > 0 && (
                  <button type="button" className="clear-btn" onClick={clearRecords}>
                    清空记录
                  </button>
                )}
              </div>
            </div>
            {renderRecordsList(
              recordsPageRecords,
              recordFilterType === 'all'
                ? null
                : `当前筛选下暂无记录。可先进入「${getExperimentLabel(recordFilterType)}」完成实验并保存。`
            )}
          </div>
          <div className="home-section dashboard-section">
            <div className="home-section-head">
              <h2>记录分布</h2>
              <p>按实验模块统计，便于判断是否需要补实验数据。</p>
            </div>
            {recordsByType.length === 0 ? (
              <p className="no-records">暂无统计数据。先完成一轮实验并保存即可生成分布。</p>
            ) : (
              <div className="stats-bars">
                {recordsByType.map((item) => {
                  const ratio = item.count / Math.max(1, learningRecords.length);
                  return (
                    <div key={item.type} className="stats-row">
                      <span className="stats-name">{item.label}</span>
                      <div className="stats-track">
                        <div className="stats-fill" style={{ width: `${Math.max(8, ratio * 100)}%` }} />
                      </div>
                      <span className="stats-count">{item.count} 条</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {page === 'account' && (
        <div className="account-page">
          <section className="home-section">
            <div className="home-section-head">
              <h2>账户管理</h2>
              <p>可修改你的昵称，修改后会在平台顶部实时展示。</p>
            </div>
            <div className="account-form">
              <label className="account-field">
                <span>邮箱（只读）</span>
                <input type="text" value={currentUser?.email ?? ''} readOnly />
              </label>
              <label className="account-field">
                <span>昵称</span>
                <input
                  type="text"
                  value={nicknameDraft}
                  onChange={(e) => setNicknameDraft(e.target.value)}
                  placeholder="请输入昵称（2-20 个字符）"
                  maxLength={20}
                />
              </label>
              <div className="account-actions">
                <button type="button" className="action-btn record-btn" disabled={accountSaving} onClick={handleSaveNickname}>
                  {accountSaving ? '保存中...' : '保存昵称'}
                </button>
                {accountStatus && <span className="account-status">{accountStatus}</span>}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default App;
