/* CampusFlow · 大二计划
 * 无依赖、离线优先的学习与生活计划工具。
 * 所有数据存储在当前浏览器的 localStorage，可在设置中导出/恢复。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'campusflow-state-v1';
  const APP_VERSION = '1.2.2';
  const CURRENT_CHANGELOG = {
    version: APP_VERSION,
    date: '2026-08-25',
    text: '学期边界与任务日历联动、过期专注恢复、移动端无障碍与窄屏体验优化。'
  };
  const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];
  const COLORS = ['teal', 'orange', 'purple', 'blue'];
  // OCR 仅在用户主动选择截图后按需加载；识别在浏览器本地完成，不上传图片。
  const OCR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  const PERIODS = [
    { id: 1, label: '第 1 节', time: '08:00–09:40' },
    { id: 2, label: '第 2 节', time: '10:00–11:40' },
    { id: 3, label: '第 3 节', time: '14:00–15:40' },
    { id: 4, label: '第 4 节', time: '16:00–17:40' },
    { id: 5, label: '第 5 节', time: '19:00–20:40' }
  ];
  const VIEW_TITLES = {
    dashboard: '总览', planner: '计划与任务', timetable: '我的课表', calendar: '日历',
    habits: '日常习惯', notes: '灵感笔记', insights: '学习统计', focus: '专注计时', settings: '设置'
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const pad = (value) => String(value).padStart(2, '0');
  const uid = (prefix) => `${prefix || 'id'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const dateKey = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const todayKey = () => dateKey(new Date());
  const dateFromKey = (key) => {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y || 1970, (m || 1) - 1, d || 1);
  };
  const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };
  const startOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day + 1);
    return d;
  };
  const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const formatDate = (key, options) => {
    if (!key) return '';
    return dateFromKey(key).toLocaleDateString('zh-CN', options || { month: 'long', day: 'numeric', weekday: 'short' });
  };
  const formatShort = (key) => formatDate(key, { month: 'numeric', day: 'numeric' });
  const escapeHtml = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const timeToMinutes = (time) => {
    const [h, m] = String(time || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const safeId = (value, prefix, index) => {
    const cleaned = String(value == null ? '' : value).trim()
      .replace(/[^A-Za-z0-9._:-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return cleaned || `${prefix}-${index}`;
  };
  const isValidDateKey = (value) => {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getFullYear() === Number(match[1])
      && date.getMonth() === Number(match[2]) - 1
      && date.getDate() === Number(match[3]);
  };
  const safeDateKey = (value, fallback) => isValidDateKey(value) ? String(value) : (fallback || '');
  const safeTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')) ? String(value) : '';
  const relativeDue = (key) => {
    if (!key) return '未设置日期';
    const diff = Math.round((dateFromKey(key) - dateFromKey(todayKey())) / 86400000);
    if (diff < 0) return `逾期 ${Math.abs(diff)} 天`;
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff < 7) return `${diff} 天后`;
    return formatShort(key);
  };
  const taskSteps = (task) => Array.isArray(task && task.steps)
    ? task.steps.filter((step) => step && String(step.text || '').trim())
    : [];
  // A task should always tell the student what to do next. Existing data from
  // v1 only has `desc`, so use it as a backwards-compatible fallback.
  const taskNextStep = (task) => {
    const steps = taskSteps(task);
    const pending = steps.find((step) => !step.done);
    if (pending) return String(pending.text).trim();
    if (steps.length) return '所有步骤已完成';
    const value = String(task && (task.nextStep || task.desc) || '').trim();
    return value || '先花 5 分钟开始处理这项任务';
  };
  const taskStepProgress = (task) => {
    const steps = taskSteps(task);
    if (!steps.length) return '';
    const done = steps.filter((step) => step.done).length;
    return done === steps.length ? `已完成 ${done} / ${steps.length} 步` : `第 ${done + 1} / ${steps.length} 步`;
  };

  function normalizeTask(task, taskIndex) {
    const source = task && typeof task === 'object' ? task : {};
    const id = safeId(source.id, 'task-legacy', Number(taskIndex) || 0);
    const fallback = String(source.nextStep || source.desc || '').trim();
    const rawSteps = Array.isArray(source.steps) && source.steps.length ? source.steps : (fallback ? [fallback] : []);
    const usedIds = new Set();
    const wasDone = source.status === 'done';
    const steps = rawSteps.map((step, index) => {
      const text = String(typeof step === 'string' ? step : (step && step.text) || '').trim();
      if (!text) return null;
      let stepId = safeId(typeof step === 'object' && step ? step.id : '', `${id}-step`, index);
      if (usedIds.has(stepId)) stepId = `${id}-step-${index}`;
      while (usedIds.has(stepId)) stepId = `${stepId}-${index}`;
      usedIds.add(stepId);
      return {
        id: stepId,
        text,
        // A completed legacy task is authoritative even when an old backup
        // stored its steps as strings or omitted per-step completion flags.
        done: wasDone || Boolean(typeof step === 'object' && step && step.done)
      };
    }).filter(Boolean);
    const allDone = steps.length > 0 && steps.every((step) => step.done);
    const status = steps.length ? (allDone ? 'done' : 'todo') : (wasDone ? 'done' : 'todo');
    const nextStep = steps.find((step) => !step.done)?.text || (allDone ? '所有步骤已完成' : fallback);
    return {
      ...source,
      id,
      title: String(source.title || '').trim() || `未命名任务 ${Number(taskIndex) + 1}`,
      status,
      nextStep,
      desc: String(source.desc || '').trim(),
      due: safeDateKey(source.due),
      time: safeTime(source.time),
      priority: ['low', 'medium', 'high'].includes(source.priority) ? source.priority : 'medium',
      category: String(source.category || '其他').trim() || '其他',
      estimate: clamp(Math.round(Number(source.estimate) || 30), 5, 999),
      course: String(source.course || '').trim(),
      focusMinutes: Math.max(0, Math.round(Number(source.focusMinutes) || 0)),
      steps
    };
  }

  function normalizeTasks(tasks) {
    const usedTaskIds = new Set();
    return (Array.isArray(tasks) ? tasks : []).map((task, index) => {
      const normalized = normalizeTask(task, index);
      let id = normalized.id;
      let suffix = 1;
      while (usedTaskIds.has(id)) id = `${normalized.id}-${suffix++}`;
      if (id !== normalized.id) {
        normalized.id = id;
        normalized.steps = normalized.steps.map((step, stepIndex) => ({ ...step, id: `${id}-step-${stepIndex}` }));
      }
      usedTaskIds.add(id);
      return normalized;
    });
  }

  function normalizeFocus(focus, fallback) {
    const source = focus && typeof focus === 'object' ? focus : {};
    const base = fallback || { duration: 25 * 60, remaining: 25 * 60, running: false, endsAt: null, sessions: 0, totalMinutes: 0, selectedTask: '' };
    const duration = clamp(Number(source.duration) || Number(base.duration) || 25 * 60, 5 * 60, 180 * 60);
    const storedEnd = Number(source.endsAt);
    const rawRemaining = Number(source.remaining);
    const remaining = clamp(Number.isFinite(rawRemaining) ? rawRemaining : duration, 0, duration);
    const running = Boolean(source.running && Number.isFinite(storedEnd) && storedEnd > Date.now());
    const liveRemaining = running ? clamp(Math.ceil((storedEnd - Date.now()) / 1000), 1, duration) : remaining;
    const rawSessions = Number(source.sessions);
    const sessions = Math.max(0, Math.floor(Number.isFinite(rawSessions) ? rawSessions : 0));
    const derivedMinutes = sessions * Math.round(duration / 60);
    const rawTotalMinutes = Number(source.totalMinutes);
    const totalMinutes = Math.max(0, Math.round(Number.isFinite(rawTotalMinutes) ? rawTotalMinutes : derivedMinutes));
    return {
      ...base,
      ...source,
      duration,
      remaining: liveRemaining,
      running,
      endsAt: running ? Date.now() + liveRemaining * 1000 : null,
      sessions,
      totalMinutes,
      selectedTask: String(source.selectedTask || '')
    };
  }

  function recoverExpiredFocus(focus, fallback, tasks) {
    const source = focus && typeof focus === 'object' ? focus : {};
    const normalized = normalizeFocus(source, fallback);
    const storedEnd = Number(source.endsAt);
    const expired = Boolean(source.running && Number.isFinite(storedEnd) && storedEnd > 0 && storedEnd <= Date.now());
    if (!expired) return { focus: normalized, recovered: false };
    const completedMinutes = Math.round(normalized.duration / 60);
    normalized.sessions += 1;
    normalized.totalMinutes += completedMinutes;
    normalized.running = false;
    normalized.endsAt = null;
    normalized.remaining = normalized.duration;
    const selected = (Array.isArray(tasks) ? tasks : []).find((task) => task.id === normalized.selectedTask);
    if (selected) selected.focusMinutes = (Number(selected.focusMinutes) || 0) + completedMinutes;
    return { focus: normalized, recovered: true };
  }

  function normalizeCollectionIds(items, prefix) {
    const used = new Set();
    return (Array.isArray(items) ? items : []).map((item, index) => {
      const copy = item && typeof item === 'object' ? { ...item } : {};
      let id = safeId(copy.id, prefix, index);
      let suffix = 1;
      while (used.has(id)) id = `${prefix}-${index}-${suffix++}`;
      copy.id = id;
      if (prefix === 'course') {
        copy.name = String(copy.name || '').trim() || `未命名课程 ${index + 1}`;
        copy.code = String(copy.code || '').trim();
        copy.teacher = String(copy.teacher || '').trim();
        copy.room = String(copy.room || '').trim();
        copy.day = clamp(Math.round(Number(copy.day) || 1), 1, DAY_NAMES.length);
        copy.period = clamp(Math.round(Number(copy.period) || 1), 1, PERIODS.length);
        copy.duration = clamp(Math.round(Number(copy.duration) || 1), 1, Math.min(3, PERIODS.length - copy.period + 1));
        copy.weeks = normalizeWeekRule(copy.weeks || '1-16');
        copy.color = COLORS.includes(copy.color) ? copy.color : 'teal';
        copy.credits = clamp(Number(copy.credits) || 0, 0, 20);
      } else if (prefix === 'event') {
        copy.title = String(copy.title || '').trim() || `未命名事件 ${index + 1}`;
        copy.date = safeDateKey(copy.date, todayKey());
        copy.time = safeTime(copy.time);
        copy.endTime = safeTime(copy.endTime);
        if (copy.time && copy.endTime && timeToMinutes(copy.endTime) <= timeToMinutes(copy.time)) copy.endTime = '';
        copy.type = ['考试', '截止', '社团', '个人', '调课'].includes(copy.type) ? copy.type : '个人';
        copy.place = String(copy.place || '').trim();
        copy.note = String(copy.note || '').trim();
        copy.color = COLORS.includes(copy.color) ? copy.color : (copy.type === '考试' ? 'purple' : copy.type === '截止' ? 'teal' : 'orange');
        copy.taskId = copy.taskId ? safeId(copy.taskId, 'task', index) : '';
        copy.autoGenerated = Boolean(copy.autoGenerated);
      } else if (prefix === 'habit') {
        copy.name = String(copy.name || '').trim() || `未命名习惯 ${index + 1}`;
        copy.emoji = String(copy.emoji || '✦').trim() || '✦';
        copy.target = String(copy.target || '每天 1 次').trim() || '每天 1 次';
        copy.color = COLORS.includes(copy.color) ? copy.color : 'teal';
        const logs = copy.logs && typeof copy.logs === 'object' && !Array.isArray(copy.logs) ? copy.logs : {};
        copy.logs = Object.fromEntries(Object.entries(logs).filter(([key, value]) => isValidDateKey(key) && Boolean(value)).map(([key]) => [key, true]));
      } else if (prefix === 'note') {
        copy.title = String(copy.title || '').trim() || `未命名笔记 ${index + 1}`;
        copy.content = String(copy.content || '');
        copy.pinned = Boolean(copy.pinned);
        const updatedAt = new Date(copy.updatedAt);
        copy.updatedAt = Number.isNaN(updatedAt.getTime()) ? new Date().toISOString() : updatedAt.toISOString();
      } else if (prefix === 'goal') {
        copy.title = String(copy.title || '').trim() || `未命名目标 ${index + 1}`;
        copy.target = String(copy.target || '').trim();
        copy.progress = clamp(Number(copy.progress) || 0, 0, 100);
        copy.due = safeDateKey(copy.due);
      }
      used.add(id);
      return copy;
    });
  }

  function normalizeProfile(profile, fallback) {
    const source = profile && typeof profile === 'object' ? profile : {};
    const base = fallback || {};
    return {
      ...base,
      ...source,
      name: String(source.name || base.name || '同学').trim() || '同学',
      major: String(source.major || base.major || '探索新学期').trim() || '探索新学期',
      academicYear: String(source.academicYear || base.academicYear || '').trim(),
      term: String(source.term || base.term || '大二上学期').trim() || '大二上学期',
      startDate: safeDateKey(source.startDate, safeDateKey(base.startDate, todayKey())),
      totalWeeks: clamp(Math.round(Number(source.totalWeeks) || Number(base.totalWeeks) || 20), 1, 40)
    };
  }

  function normalizeSettings(settings, fallback) {
    const source = settings && typeof settings === 'object' ? settings : {};
    const base = fallback || {};
    const reminderSent = source.reminderSent && typeof source.reminderSent === 'object' && !Array.isArray(source.reminderSent) ? source.reminderSent : {};
    return {
      ...base,
      ...source,
      theme: source.theme === 'dark' || source.theme === 'light' ? source.theme : (base.theme === 'dark' ? 'dark' : 'light'),
      density: source.density === 'compact' || source.density === 'comfortable' ? source.density : (base.density === 'compact' ? 'compact' : 'comfortable'),
      autoEvent: typeof source.autoEvent === 'boolean' ? source.autoEvent : Boolean(base.autoEvent),
      reminderEnabled: typeof source.reminderEnabled === 'boolean' ? source.reminderEnabled : base.reminderEnabled !== false,
      reminderInterval: [15, 30, 60].includes(Number(source.reminderInterval)) ? Number(source.reminderInterval) : ([15, 30, 60].includes(Number(base.reminderInterval)) ? Number(base.reminderInterval) : 30),
      notifications: typeof source.notifications === 'boolean' ? source.notifications : base.notifications === true,
      reminderSent: { ...(base.reminderSent || {}), ...reminderSent }
    };
  }

  function normalizeDaily(daily, fallback) {
    const source = daily && typeof daily === 'object' ? daily : {};
    const base = fallback || {};
    return {
      ...base,
      ...source,
      water: clamp(Math.round(Number.isFinite(Number(source.water)) ? Number(source.water) : Number(base.water) || 0), 0, 40),
      waterGoal: clamp(Math.round(Number.isFinite(Number(source.waterGoal)) ? Number(source.waterGoal) : Number(base.waterGoal) || 8), 1, 40),
      mood: String(source.mood || base.mood || '平静'),
      sleep: String(source.sleep || base.sleep || ''),
      journal: String(source.journal || base.journal || '')
    };
  }

  function compareVersions(first, second) {
    const left = String(first || '').split('.').map((part) => Number(part) || 0);
    const right = String(second || '').split('.').map((part) => Number(part) || 0);
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      if ((left[index] || 0) !== (right[index] || 0)) return (right[index] || 0) - (left[index] || 0);
    }
    return 0;
  }

  function mergeChangelog(entries) {
    const byVersion = new Map();
    [CURRENT_CHANGELOG, ...(Array.isArray(entries) ? entries : [])].forEach((entry) => {
      const source = entry && typeof entry === 'object' ? entry : {};
      const version = String(source.version || '').trim();
      if (!version || byVersion.has(version)) return;
      byVersion.set(version, {
        version,
        date: safeDateKey(source.date),
        text: String(source.text || '').trim() || '功能与稳定性改进。'
      });
    });
    return Array.from(byVersion.values()).sort((a, b) => {
      if (a.version === APP_VERSION) return -1;
      if (b.version === APP_VERSION) return 1;
      return compareVersions(a.version, b.version) || String(b.date).localeCompare(String(a.date));
    });
  }

  function syncTaskCalendarEvent(task) {
    if (!state || !Array.isArray(state.events)) return false;
    const taskId = task && task.id ? safeId(task.id, 'task', 0) : '';
    const matches = state.events.filter((event) => event && event.autoGenerated === true && event.taskId === taskId);
    const shouldExist = Boolean(state.settings?.autoEvent === true && taskId && task && task.status !== 'done' && isValidDateKey(task.due));
    let changed = false;
    if (!shouldExist) {
      if (matches.length) {
        state.events = state.events.filter((event) => !(event && event.autoGenerated === true && event.taskId === taskId));
        changed = true;
      }
      return changed;
    }
    const primary = matches[0] || { id: uid('event'), autoGenerated: true, taskId };
    const next = {
      ...primary,
      taskId,
      autoGenerated: true,
      title: `任务截止 · ${String(task.title || '未命名任务').trim()}`,
      date: task.due,
      time: safeTime(task.time),
      endTime: '',
      type: '截止',
      place: '',
      color: 'teal',
      note: String(task.desc || taskNextStep(task) || '').trim()
    };
    if (!matches.length) {
      state.events.push(next);
      changed = true;
    } else {
      const previous = JSON.stringify(primary);
      Object.assign(primary, next);
      if (JSON.stringify(primary) !== previous) changed = true;
      if (matches.length > 1) {
        const keep = primary.id;
        state.events = state.events.filter((event) => !(event && event.autoGenerated === true && event.taskId === taskId && event.id !== keep));
        changed = true;
      }
    }
    return changed;
  }

  function syncTaskCalendarEvents() {
    if (!state || !Array.isArray(state.events)) return false;
    let changed = false;
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    // Older builds created task deadline events without the autoGenerated flag.
    // Re-link only the unambiguous title/date pair so completed tasks do not
    // leave a stale marker in the calendar after upgrading.
    state.events.forEach((event) => {
      if (!event || event.autoGenerated || event.taskId || !isValidDateKey(event.date)) return;
      const matches = tasks.filter((task) => task && task.due === event.date && (
        event.title === task.title || event.title === `任务截止 · ${task.title}`
      ));
      if (matches.length !== 1) return;
      const [match] = matches;
      event.autoGenerated = true;
      event.taskId = safeId(match.id, 'task', 0);
      changed = true;
    });
    tasks.forEach((task) => { if (syncTaskCalendarEvent(task)) changed = true; });
    const validIds = new Set(tasks.map((task) => safeId(task.id, 'task', 0)));
    const before = state.events.length;
    state.events = state.events.filter((event) => !event.autoGenerated || (state.settings?.autoEvent === true && validIds.has(event.taskId) && tasks.some((task) => safeId(task.id, 'task', 0) === event.taskId && task.status !== 'done' && isValidDateKey(task.due))));
    if (state.events.length !== before) changed = true;
    return changed;
  }

  function seedState() {
    const today = new Date();
    const week = startOfWeek(today);
    const d = (offset) => dateKey(addDays(today, offset));
    return {
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
      profile: { name: '同学', major: '探索新学期', academicYear: `${today.getFullYear()}–${today.getFullYear() + 1}`, term: '大二上学期', startDate: d(7), totalWeeks: 20 },
      settings: {
        theme: 'light', density: 'comfortable', autoEvent: true,
        // 站内未完成任务提醒默认开启；设备通知仍需用户在设置中主动授权。
        reminderEnabled: true, reminderInterval: 30, notifications: false,
        reminderSent: {}
      },
      tasks: [
        { id: uid('task'), title: '完成高数第一章预习', nextStep: '打开课程视频并看完第一小节', steps: [{ id: uid('step'), text: '打开课程视频并看完第一小节', done: false }, { id: uid('step'), text: '整理 1 页知识点笔记', done: false }, { id: uid('step'), text: '标出仍不理解的定义', done: false }], desc: '准备纸笔，记下仍不理解的定义', due: d(1), time: '20:00', priority: 'high', category: '课程', status: 'todo', estimate: 60, course: '高等数学' },
        { id: uid('task'), title: '英语四级词汇打卡', nextStep: '打开词汇 App，完成前 20 个单词', steps: [{ id: uid('step'), text: '打开词汇 App，完成前 20 个单词', done: false }, { id: uid('step'), text: '完成后 20 个单词', done: false }, { id: uid('step'), text: '复习并标记今天的错词', done: false }], desc: '每天共 40 个单词', due: d(0), time: '21:30', priority: 'medium', category: '成长', status: 'todo', estimate: 25, course: '' },
        { id: uid('task'), title: '整理社团招新海报', nextStep: '先和宣传部确认最终文案', steps: [{ id: uid('step'), text: '先和宣传部确认最终文案', done: false }, { id: uid('step'), text: '确认尺寸与截止时间', done: false }, { id: uid('step'), text: '完成排版并发预览图确认', done: false }], desc: '', due: d(3), time: '18:00', priority: 'low', category: '社团', status: 'todo', estimate: 45, course: '' },
        { id: uid('task'), title: '提交暑期实践报告', nextStep: '检查格式后上传系统', steps: [{ id: uid('step'), text: '检查格式后上传系统', done: true }, { id: uid('step'), text: '保留提交成功截图', done: true }], desc: '', due: d(-1), time: '23:00', priority: 'high', category: '课程', status: 'done', estimate: 30, course: '' }
      ],
      courses: [
        { id: uid('course'), name: '高等数学', code: 'MATH201', teacher: '李老师', room: 'A-302', day: 1, period: 1, duration: 1, weeks: '1-16', color: 'teal', credits: 4 },
        { id: uid('course'), name: '大学英语 III', code: 'ENGL203', teacher: '王老师', room: 'B-208', day: 2, period: 2, duration: 1, weeks: '1-16', color: 'orange', credits: 3 },
        { id: uid('course'), name: '数据结构', code: 'CS204', teacher: '陈老师', room: '实训楼 401', day: 3, period: 2, duration: 2, weeks: '1-16', color: 'purple', credits: 4 },
        { id: uid('course'), name: '体育（羽毛球）', code: 'PE201', teacher: '赵老师', room: '体育馆', day: 4, period: 4, duration: 1, weeks: '1-16', color: 'blue', credits: 1 },
        { id: uid('course'), name: '专业导论', code: 'CS200', teacher: '周老师', room: 'C-105', day: 5, period: 3, duration: 1, weeks: '1-8', color: 'teal', credits: 2 }
      ],
      events: [
        { id: uid('event'), title: '社团招新说明会', date: d(2), time: '18:30', endTime: '20:00', type: '社团', place: '大学生活动中心', color: 'orange', note: '' },
        { id: uid('event'), title: '高数作业截止', date: d(1), time: '23:00', endTime: '', type: '截止', place: '', color: 'teal', note: '别忘了拍照上传' }
      ],
      habits: [
        { id: uid('habit'), name: '早起不赖床', emoji: '🌤️', target: '每天 1 次', color: 'teal', logs: {} },
        { id: uid('habit'), name: '英语听力 20 分钟', emoji: '🎧', target: '每天 1 次', color: 'orange', logs: {} },
        { id: uid('habit'), name: '运动 / 拉伸', emoji: '🏸', target: '每周 3 次', color: 'purple', logs: {} }
      ],
      notes: [
        { id: uid('note'), title: '给大二的自己', content: '把重要的事写下来，给每个目标留一点缓冲。', pinned: true, updatedAt: new Date().toISOString() },
        { id: uid('note'), title: '本学期想尝试', content: '参加一次比赛、做一个完整的小项目、认识更多有趣的人。', pinned: false, updatedAt: new Date().toISOString() }
      ],
      goals: [
        { id: uid('goal'), title: '把绩点稳在 3.5 以上', target: '每周至少完成 4 次主动复习', progress: 35, due: d(120) },
        { id: uid('goal'), title: '完成一个作品集项目', target: '10 月底前上线 v1', progress: 18, due: d(70) },
        { id: uid('goal'), title: '保持规律运动', target: '每周运动 3 次', progress: 52, due: d(90) }
      ],
      daily: { water: 3, waterGoal: 8, mood: '平静', sleep: '7h 20m', journal: '' },
      focus: { duration: 25 * 60, remaining: 25 * 60, running: false, endsAt: null, sessions: 4, totalMinutes: 100, selectedTask: '' },
      changelog: [CURRENT_CHANGELOG]
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seedState();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('状态格式无效');
      const seeded = seedState();
      const tasks = Array.isArray(parsed.tasks) ? normalizeTasks(parsed.tasks) : seeded.tasks;
      const focusRecovery = recoverExpiredFocus(parsed.focus, seeded.focus, tasks);
      const migrated = {
        ...seeded, ...parsed,
        // Never let an older backup/local record downgrade the current
        // storage schema.  The rest of the normalizers below can then safely
        // migrate legacy records while the UI consistently reports v2 data.
        schemaVersion: Math.max(2, Math.min(999, Math.floor(Number(parsed.schemaVersion) || 0))),
        profile: normalizeProfile(parsed.profile, seeded.profile),
        settings: normalizeSettings(parsed.settings, seeded.settings),
        daily: normalizeDaily(parsed.daily, seeded.daily),
        focus: focusRecovery.focus,
        tasks,
        courses: Array.isArray(parsed.courses) ? normalizeCollectionIds(parsed.courses, 'course') : seeded.courses,
        events: Array.isArray(parsed.events) ? normalizeCollectionIds(parsed.events, 'event') : seeded.events,
        habits: Array.isArray(parsed.habits) ? normalizeCollectionIds(parsed.habits, 'habit') : seeded.habits,
        notes: Array.isArray(parsed.notes) ? normalizeCollectionIds(parsed.notes, 'note') : seeded.notes,
        goals: Array.isArray(parsed.goals) ? normalizeCollectionIds(parsed.goals, 'goal') : seeded.goals,
        changelog: mergeChangelog(parsed.changelog)
      };
      if (focusRecovery.recovered) {
        migrated.updatedAt = new Date().toISOString();
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch (error) { /* saveState will surface storage errors after startup */ }
      }
      return migrated;
    } catch (error) {
      console.warn('CampusFlow state could not be loaded', error);
      return seedState();
    }
  }

  let state = loadState();
  if (syncTaskCalendarEvents()) {
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { /* saveState reports storage errors after UI boot */ }
  }
  let currentView = VIEW_TITLES[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  let currentWeek = startOfWeek(new Date());
  // Mobile timetable keeps a focused day while desktop continues to show the
  // complete seven-day grid. Store the index (0 = Monday) so switching weeks
  // does not unexpectedly jump between columns.
  let mobileTimetableDay = Math.max(0, (new Date().getDay() || 7) - 1);
  let calendarCursor = new Date();
  let selectedNoteId = state.notes[0] ? state.notes[0].id : null;
  let plannerFilter = 'all';
  let plannerSort = 'due';
  let searchTerm = '';
  let focusTick = null;
  let lastFocusState = null;
  let modalReturnFocus = null;
  let reminderTimer = null;
  let lastReminderCheckAt = 0;
  let lastReminderDay = todayKey();
  const pendingReminderKeys = new Set();

  function saveState() {
    syncTaskCalendarEvents();
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { showToast('浏览器存储空间不足，请导出备份', 'error'); }
  }

  function showToast(message, type, duration) {
    const stack = $('#toast-stack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type || ''}`;
    toast.textContent = message;
    stack.appendChild(toast);
    window.setTimeout(() => toast.remove(), Number(duration) || 3300);
  }

  /*
   * 未完成任务提醒
   * - 站内提醒默认开启，只关注今天和已逾期的未完成任务。
   * - reminderSent 按 task.id + due 保存当天的通道发送记录，定时检查不会重复轰炸。
   * - Notification 权限永远只在用户点击“开启设备通知”后请求。
   */
  function ensureReminderSettings() {
    state.settings ||= {};
    if (typeof state.settings.reminderEnabled !== 'boolean') state.settings.reminderEnabled = true;
    const interval = Number(state.settings.reminderInterval);
    state.settings.reminderInterval = [15, 30, 60].includes(interval) ? interval : 30;
    if (!state.settings.reminderSent || typeof state.settings.reminderSent !== 'object' || Array.isArray(state.settings.reminderSent)) state.settings.reminderSent = {};
    return state.settings;
  }

  function reminderItems() {
    const today = todayKey();
    const priorityRank = { high: 0, medium: 1, low: 2 };
    return state.tasks.filter((task) => task && task.status !== 'done' && /^\d{4}-\d{2}-\d{2}$/.test(String(task.due || '')) && task.due <= today)
      .map((task) => ({ task, kind: task.due < today ? 'overdue' : 'today' }))
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'overdue' ? -1 : 1)
        || String(a.task.due || '').localeCompare(String(b.task.due || ''))
        || (priorityRank[a.task.priority] ?? 3) - (priorityRank[b.task.priority] ?? 3)
        || String(a.task.time || '').localeCompare(String(b.task.time || '')));
  }

  function reminderKey(item) {
    const currentStep = taskSteps(item.task).find((step) => !step.done);
    return `${item.task.id}|${item.task.due}|${currentStep?.id || 'task'}`;
  }

  function reminderSummary(items) {
    const overdue = items.filter((item) => item.kind === 'overdue').length;
    const today = items.length - overdue;
    const chunks = [];
    if (overdue) chunks.push(`逾期 ${overdue} 项`);
    if (today) chunks.push(`今日 ${today} 项`);
    return chunks.join(' · ') || '暂无未完成任务';
  }

  function reminderBody(items) {
    const preview = items.slice(0, 1).map((item) => `${item.task.title} · ${taskStepProgress(item.task) || '待完成'}；现在做：${taskNextStep(item.task)}`).join('、');
    const suffix = items.length > 1 ? `（另有 ${items.length - 1} 项）` : '';
    return `${reminderSummary(items)}：${preview}${suffix}`;
  }

  function notificationStatus() {
    const isAppleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
    if (isAppleMobile && !standalone) return { supported: false, permission: 'install-required', label: 'iPhone / iPad 请先“添加到主屏幕”，再从桌面图标打开并授权' };
    if (typeof window === 'undefined' || !('Notification' in window)) return { supported: false, permission: 'unsupported', label: '当前浏览器不支持设备通知，可继续使用站内提醒' };
    if (!window.isSecureContext && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(location.href)) return { supported: false, permission: 'insecure', label: '设备通知需要 HTTPS 安全连接' };
    const permission = window.Notification.permission;
    if (permission === 'granted') return { supported: true, permission, label: '手机 / 电脑设备通知已启用' };
    if (permission === 'denied') return { supported: true, permission, label: '通知权限已关闭，请在浏览器或系统设置中重新允许' };
    return { supported: true, permission, label: '点击后由浏览器弹出系统授权，不会偷偷获取权限' };
  }

  function reminderNotificationAction(compact) {
    const notification = notificationStatus();
    if (notification.permission === 'granted') return compact ? '<span class="notification-chip success">🔔 已开启</span>' : '<span class="notification-state success">✓ 设备通知已授权</span>';
    if (notification.permission === 'denied') return '<button class="btn btn-ghost btn-sm" data-action="go-view" data-view="settings">检查通知权限</button>';
    if (notification.supported) return `<button class="btn ${compact ? 'btn-ghost' : 'btn-primary'} btn-sm" data-action="request-notification">🔔 开启设备通知</button>`;
    return compact ? '' : `<span class="notification-state">${escapeHtml(notification.label)}</span>`;
  }

  function renderReminderPanel() {
    const settings = ensureReminderSettings();
    const items = reminderItems();
    if (!settings.reminderEnabled) {
      return '<section class="card reminder-panel reminder-panel-muted" aria-label="未完成任务提醒"><div class="reminder-head"><div><div class="eyebrow">Task reminders</div><h3>未完成任务提醒已关闭</h3><p>可在“设置 → 外观与提醒”中重新开启。</p></div><button class="btn btn-ghost btn-sm" data-action="go-view" data-view="settings">打开设置</button></div></section>';
    }
    if (!items.length) {
      return `<section class="card reminder-panel reminder-panel-clear" aria-label="未完成任务提醒" aria-live="polite"><div class="reminder-head"><div><div class="eyebrow">Task reminders</div><h3>今天没有逾期或未完成任务</h3><p>做得很好，继续保持轻盈的节奏。</p></div><div class="reminder-head-actions">${reminderNotificationAction(true)}<span class="reminder-checkmark" aria-hidden="true">✓</span></div></div></section>`;
    }
    const visible = items.slice(0, 6);
    const rows = visible.map((item) => {
      const task = item.task;
      const dueLabel = item.kind === 'overdue' ? `${relativeDue(task.due)}${task.time ? ` · ${task.time}` : ''}` : `今天${task.time ? ` · ${task.time}` : ''}`;
      const progress = taskStepProgress(task);
      return `<div class="reminder-item ${item.kind}" data-task-id="${escapeHtml(task.id)}"><button class="task-check" data-action="toggle-task" data-id="${escapeHtml(task.id)}" aria-label="完成整项任务"> </button><div class="priority-dot ${task.priority || 'low'}"></div><div class="reminder-copy"><strong>${escapeHtml(task.title)}</strong><span class="${item.kind === 'overdue' ? 'error' : ''}">${dueLabel}${progress ? ` · ${progress}` : ''}</span><small class="reminder-next-step"><b>现在做</b> ${escapeHtml(taskNextStep(task))}</small></div><div class="reminder-item-actions">${taskSteps(task).some((step) => !step.done) ? `<button class="btn btn-ghost btn-xs reminder-step-btn" data-action="advance-task" data-id="${escapeHtml(task.id)}">完成此步</button><button class="btn btn-ghost btn-xs" data-action="start-task-focus" data-id="${escapeHtml(task.id)}">去专注</button>` : ''}</div><button class="icon-btn subtle" data-action="edit-task" data-id="${escapeHtml(task.id)}" aria-label="编辑任务">✎</button></div>`;
    }).join('');
    const more = items.length > visible.length ? `<p class="reminder-more">还有 ${items.length - visible.length} 项，请到计划与任务查看。</p>` : '';
    return `<section class="card reminder-panel" aria-label="未完成任务提醒" aria-live="polite"><div class="reminder-head"><div><div class="eyebrow">Task reminders</div><h3>未完成任务提醒</h3><p>${reminderSummary(items)} · 每完成一步，会继续提醒下一步</p></div><div class="reminder-head-actions">${reminderNotificationAction(true)}<button class="btn btn-ghost btn-sm" data-action="go-view" data-view="planner">查看全部</button></div></div><div class="reminder-list">${rows}</div>${more}</section>`;
  }

  function pruneReminderHistory() {
    const settings = ensureReminderSettings();
    const cutoff = dateKey(addDays(new Date(), -31));
    const entries = Object.entries(settings.reminderSent).filter(([, record]) => {
      if (!record || typeof record !== 'object') return false;
      const day = [record.inAppDay, record.browserDay].map((value) => String(value || '')).sort().at(-1);
      return day >= cutoff;
    }).sort((a, b) => Number(a[1].updatedAt || 0) - Number(b[1].updatedAt || 0)).slice(-120);
    settings.reminderSent = Object.fromEntries(entries);
  }

  async function showDeviceNotification(title, options) {
    const status = notificationStatus();
    if (!status.supported || status.permission !== 'granted') return false;
    const notificationOptions = { icon: './favicon.svg', badge: './favicon.svg', ...options };
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, notificationOptions);
        return true;
      } catch (error) { /* Fall through to a window notification on desktop. */ }
    }
    try {
      const notice = new window.Notification(title, notificationOptions);
      notice.onclick = () => {
        try { window.focus(); } catch (error) { /* 某些浏览器禁止聚焦，忽略即可 */ }
        setView('planner');
        notice.close();
      };
      return true;
    } catch (error) {
      return false;
    }
  }

  async function sendBrowserReminder(items, options) {
    const opts = options || {};
    const forced = items.find((item) => item.force);
    const task = forced?.task;
    return showDeviceNotification(forced ? 'CampusFlow · 下一步提醒' : 'CampusFlow · 该做下一步了', {
      body: forced ? `${task.title}：现在做「${taskNextStep(task)}」` : reminderBody(items),
      tag: forced ? `campusflow-task-step-${safeId(task.id, 'task', 0)}-${safeId(taskSteps(task).find((step) => !step.done)?.id, 'step', 0)}` : 'campusflow-task-reminder',
      renotify: Boolean(forced),
      data: { view: 'planner', taskId: task?.id || '' },
      ...(opts.extra || {})
    });
  }

  function syncAppBadge(count) {
    if (notificationStatus().permission !== 'granted') return;
    try {
      const operation = count > 0 && navigator.setAppBadge ? navigator.setAppBadge(count) : navigator.clearAppBadge ? navigator.clearAppBadge() : null;
      if (operation?.catch) operation.catch(() => {});
    } catch (error) { /* Badging is optional and must never block reminders. */ }
  }

  async function checkReminders(options) {
    const opts = options || {};
    const settings = ensureReminderSettings();
    const now = Date.now();
    const intervalMs = settings.reminderInterval * 60 * 1000;
    if (opts.source === 'timer' && now - lastReminderCheckAt < intervalMs) return { items: [], skipped: true };
    lastReminderCheckAt = now;
    const items = reminderItems();
    const forcedTask = opts.forceBrowser && opts.taskId ? state.tasks.find((task) => task && task.id === opts.taskId && task.status !== 'done' && taskSteps(task).some((step) => !step.done)) : null;
    const forcedItem = forcedTask ? { task: forcedTask, kind: forcedTask.due && forcedTask.due < todayKey() ? 'overdue' : 'today', force: true } : null;
    const browserCandidates = forcedItem ? [forcedItem, ...items.filter((item) => reminderKey(item) !== reminderKey(forcedItem))] : items;
    const notification = notificationStatus();
    if (settings.notifications === true && notification.permission !== 'granted') {
      settings.notifications = false;
      saveState();
      if (currentView === 'settings') render();
    }
    syncAppBadge(settings.notifications === true ? items.length : 0);
    if (lastReminderDay !== todayKey()) {
      lastReminderDay = todayKey();
      if (currentView === 'dashboard') render();
    }
    if (!items.length && !forcedItem) return { items, notified: 0 };

    const day = todayKey();
    const sent = settings.reminderSent;
    const inAppItems = opts.skipInApp || !settings.reminderEnabled ? [] : items.filter((item) => sent[reminderKey(item)]?.inAppDay !== day);
    const browserEnabled = settings.notifications === true && notification.permission === 'granted';
    // A permission click may run an immediate check, but the same daily key
    // still suppresses duplicates so repeated visits never spam notifications.
    const browserItems = browserEnabled ? browserCandidates.filter((item) => (item.force || sent[reminderKey(item)]?.browserDay !== day) && !pendingReminderKeys.has(reminderKey(item))) : [];
    let changed = false;
    let browserDeliveredCount = 0;

    if (inAppItems.length) {
      showToast(`未完成任务提醒：${reminderBody(inAppItems)}`, 'warning', 7200);
      inAppItems.forEach((item) => {
        const key = reminderKey(item);
        sent[key] = { ...(sent[key] || {}), inAppDay: day, updatedAt: now };
      });
      changed = true;
    }
    if (browserItems.length) {
      const keys = browserItems.map(reminderKey);
      keys.forEach((key) => pendingReminderKeys.add(key));
      let delivered = false;
      try { delivered = await sendBrowserReminder(browserItems); }
      finally { keys.forEach((key) => pendingReminderKeys.delete(key)); }
      if (delivered) {
        browserDeliveredCount = browserItems.length;
        browserItems.filter((item) => !item.force).forEach((item) => {
          const key = reminderKey(item);
          sent[key] = { ...(sent[key] || {}), browserDay: day, updatedAt: now };
        });
        changed = true;
      }
    }
    if (changed) {
      pruneReminderHistory();
      saveState();
    }
    return { items, notified: inAppItems.length + browserDeliveredCount };
  }

  async function requestBrowserNotification() {
    const status = notificationStatus();
    if (!status.supported) return showToast(status.label, 'error');
    if (status.permission === 'denied') {
      state.settings.notifications = false;
      saveState();
      render();
      return showToast(status.label, 'error');
    }
    if (status.permission === 'granted') {
      state.settings.notifications = true;
      saveState();
      render();
      await checkReminders({ source: 'permission', forceBrowser: true, skipInApp: true });
      return showToast('设备通知已启用：每完成一步都会提醒下一步', 'success');
    }
    try {
      const permission = await window.Notification.requestPermission();
      if (permission === 'granted') {
        state.settings.notifications = true;
        saveState();
        render();
        await checkReminders({ source: 'permission', forceBrowser: true, skipInApp: true });
        showToast('设备通知已启用：每完成一步都会提醒下一步', 'success');
      } else if (permission === 'denied') {
        state.settings.notifications = false;
        saveState();
        showToast('你关闭了设备通知，可在浏览器或系统设置中重新允许', 'error');
        render();
      } else {
        showToast('暂未授权设备通知，站内提醒仍会正常工作');
      }
    } catch (error) {
      showToast('无法请求通知权限，请检查浏览器和 HTTPS 设置', 'error');
    }
  }

  async function sendTestNotification() {
    const status = notificationStatus();
    if (status.permission !== 'granted') return requestBrowserNotification();
    const sent = await showDeviceNotification('CampusFlow · 通知测试成功', {
      body: '设备通知已经连接。以后会告诉你当前第几步，以及现在该做什么。',
      tag: `campusflow-test-${Date.now()}`,
      data: { view: 'planner' }
    });
    showToast(sent ? '测试通知已发送，请查看系统通知栏' : '测试通知发送失败，请检查系统通知设置', sent ? 'success' : 'error');
  }

  function initReminderChecks() {
    checkReminders({ source: 'open' });
    if (reminderTimer) window.clearInterval(reminderTimer);
    reminderTimer = window.setInterval(() => checkReminders({ source: 'timer' }), 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkReminders({ source: 'resume' });
    });
  }

  function setView(view) {
    currentView = VIEW_TITLES[view] ? view : 'dashboard';
    const nextUrl = `${location.pathname}${location.search}#${currentView}`;
    if (history.pushState && location.hash !== `#${currentView}`) history.pushState(null, '', nextUrl);
    $$('.nav-item').forEach((item) => {
      const active = item.dataset.view === currentView;
      item.classList.toggle('active', active);
      item.setAttribute('aria-current', active ? 'page' : 'false');
    });
    $('#page-title').textContent = VIEW_TITLES[currentView];
    setSidebarOpen(false, { returnFocus: true });
    render();
  }

  function setSidebarOpen(open, options) {
    const sidebar = $('#sidebar');
    const backdrop = $('#sidebar-backdrop');
    const menu = $('.mobile-menu');
    const main = $('.main-content');
    if (!sidebar) return;
    const mobile = Boolean(window.matchMedia?.('(max-width: 760px)').matches);
    const shouldOpen = mobile && Boolean(open);
    sidebar.classList.toggle('open', shouldOpen);
    if (mobile) {
      sidebar.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
      // inert removes hidden sidebar controls from the keyboard focus order.
      sidebar.inert = !shouldOpen;
    } else {
      sidebar.removeAttribute('aria-hidden');
      sidebar.inert = false;
    }
    if (backdrop) backdrop.hidden = !shouldOpen;
    if (main) main.inert = shouldOpen;
    if (menu) {
      menu.setAttribute('aria-expanded', String(shouldOpen));
      menu.setAttribute('aria-label', shouldOpen ? '关闭菜单' : '打开菜单');
    }
    if (shouldOpen && options?.focusMenu !== false) {
      window.requestAnimationFrame(() => {
        if (sidebar.classList.contains('open') && !sidebar.inert) $('.nav-item', sidebar)?.focus();
      });
    } else if (mobile && options?.returnFocus && menu?.isConnected) {
      menu.focus();
    }
  }

  function syncSidebarA11y() {
    const sidebar = $('#sidebar');
    if (!sidebar) return;
    setSidebarOpen(sidebar.classList.contains('open'), { focusMenu: false });
  }

  function render() {
    document.body.classList.toggle('dark', state.settings.theme === 'dark');
    document.documentElement.dataset.density = state.settings.density || 'comfortable';
    $$('.nav-item').forEach((item) => {
      const active = item.dataset.view === currentView;
      item.classList.toggle('active', active);
      item.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if ($('#page-title')) $('#page-title').textContent = VIEW_TITLES[currentView] || VIEW_TITLES.dashboard;
    const profileName = state.profile.name || '同学';
    $('#user-name').textContent = profileName;
    $('#user-major').textContent = state.profile.major || '探索新学期';
    $('#user-avatar').textContent = profileName.slice(0, 1);
    $('.semester-label').textContent = state.profile.term || '大二上学期';
    const academicYearLabel = $('.breadcrumb > span');
    if (academicYearLabel) academicYearLabel.textContent = state.profile.academicYear || `${new Date().getFullYear()}–${new Date().getFullYear() + 1}`;
    $('#today-label').textContent = formatDate(todayKey(), { month: 'long', day: 'numeric' });
    const activeTasks = state.tasks.filter((task) => task.status !== 'done').length;
    $('#todo-count').textContent = activeTasks > 99 ? '99+' : activeTasks;
    const container = $('#view-container');
    if (!container) return;
    const views = { dashboard: renderDashboard, planner: renderPlanner, timetable: renderTimetable, calendar: renderCalendar, habits: renderHabits, notes: renderNotes, insights: renderInsights, focus: renderFocus, settings: renderSettings };
    container.innerHTML = (views[currentView] || renderDashboard)();
    bindViewShortcuts();
  }

  function viewHeading(eyebrow, title, desc, actions) {
    return `<div class="view-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${desc}</p></div><div class="heading-actions">${actions || ''}</div></div>`;
  }

  function statCard(icon, value, label, tone) {
    return `<div class="card stat-card"><div class="stat-icon ${tone}">${icon}</div><strong>${value}</strong><span>${label}</span></div>`;
  }

  function taskRow(task, compact) {
    const done = task.status === 'done';
    const dueClass = task.due && task.due < todayKey() && !done ? 'error' : '';
    const progress = taskStepProgress(task);
    const id = escapeHtml(task.id);
    return `<div class="task-row" data-task-id="${id}">
      <button class="task-check ${done ? 'done' : ''}" data-action="toggle-task" data-id="${id}" aria-label="${done ? '标记未完成' : '标记完成'}">${done ? '✓' : ''}</button>
      <div class="priority-dot ${task.priority || 'low'}"></div>
      <div class="task-main"><span class="task-title ${done ? 'done' : ''}">${escapeHtml(task.title)}</span><span class="task-meta"><span class="${dueClass}">${relativeDue(task.due)}</span>${task.category ? `<span>· ${escapeHtml(task.category)}</span>` : ''}${task.time ? `<span>· ${escapeHtml(task.time)}</span>` : ''}${progress ? `<span>· ${progress}</span>` : ''}</span>${!done ? `<small class="task-next-step"><b>下一步</b> ${escapeHtml(taskNextStep(task))}</small>` : ''}</div>
      <div class="task-actions"><button class="icon-btn subtle" data-action="edit-task" data-id="${id}" aria-label="编辑任务">✎</button><button class="icon-btn subtle" data-action="delete-task" data-id="${id}" aria-label="删除任务">×</button></div>
    </div>`;
  }

  function renderDashboard() {
    const today = todayKey();
    const todo = state.tasks.filter((task) => task.status !== 'done');
    const done = state.tasks.filter((task) => task.status === 'done');
    const todayTasks = state.tasks.filter((task) => task.due === today).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const todayPendingCount = todayTasks.filter((task) => task.status !== 'done').length;
    const todayHabits = state.habits.map((habit) => ({ habit, done: Boolean(habit.logs && habit.logs[today]) }));
    const completedHabits = todayHabits.filter((item) => item.done).length;
    const completion = state.tasks.length ? Math.round(done.length / state.tasks.length * 100) : 0;
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(new Date()), i));
    const nextCourse = getNextCourse();
    const nextCourseDayDiff = nextCourse ? Math.round((dateFromKey(nextCourse.occurrenceDate) - dateFromKey(today)) / 86400000) : 0;
    const nextCourseWhen = nextCourseDayDiff === 0
      ? '今天'
      : nextCourseDayDiff === 1
        ? '明天'
        : nextCourseDayDiff <= 7
          ? `下周${DAY_NAMES[nextCourse.day - 1]}`
          : `${formatShort(nextCourse.occurrenceDate)} 周${DAY_NAMES[nextCourse.day - 1]}`;
    const nextCourseLabel = nextCourse ? `${nextCourse.name} · ${nextCourseWhen} ${PERIODS[nextCourse.period - 1]?.time || ''}` : '近期没有安排课程，留一点时间给自己。';
    const semesterWeek = getSemesterWeek(new Date());
    const totalWeeks = Number(state.profile.totalWeeks) || 20;
    const weekLabel = semesterWeek === 0 ? '开学前' : semesterWeek > totalWeeks ? '学期已结束' : `第 ${semesterWeek} 周 / 共 ${totalWeeks} 周`;
    return `${viewHeading('Good morning', `早上好，${escapeHtml(state.profile.name || '同学')} 👋`, `大二${state.profile.term && state.profile.term.includes('下') ? '下' : '上'}学期 · ${weekLabel}`, `<button class="btn btn-ghost" data-action="open-updates">✦ 更新 ${APP_VERSION}</button><button class="btn btn-primary" data-action="new-task">＋ 新建任务</button>`)}
      ${renderReminderPanel()}
      <div class="grid dashboard-grid">
        <div><div class="welcome-card"><div class="eyebrow">今日提醒</div><h2>${escapeHtml(nextCourseLabel)}</h2><p>${todayPendingCount ? `今天还有 ${todayPendingCount} 项待办，先完成最重要的一件。` : '今天到期的任务都处理好了，给自己留一点探索时间。'}</p><span class="welcome-quote">Small steps, big semester.</span></div>
          <div class="grid stats-grid">${statCard('✓', `${completion}%`, '任务完成率', 'teal')}${statCard('◷', `${state.focus.sessions || 0}`, '累计专注次数', 'orange')}${statCard('↗', `${completedHabits}/${state.habits.length || 0}`, '今日习惯', 'purple')}${statCard('▦', `${state.courses.length}`, '本学期课程', 'blue')}</div>
        </div>
        <div class="card focus-card"><div class="eyebrow">Focus moment</div><h3>给自己 25 分钟</h3><p>一次只做一件事，专注比忙碌更接近目标。</p><div class="focus-progress"><div class="progress-track"><div class="progress-fill" style="width:${clamp((state.focus.sessions || 0) * 8, 0, 100)}%"></div></div><div class="progress-meta"><span>本周专注进度</span><span>${state.focus.sessions || 0} 次</span></div></div><button class="btn" data-action="go-focus">开始专注 →</button></div>
      </div>
      <div class="grid two-col"><div class="card"><div class="card-header"><h3>这一周</h3><button class="muted-link" data-action="go-view" data-view="calendar">查看日历 →</button></div><div class="week-strip">${weekDays.map((day) => { const key = dateKey(day); const count = state.tasks.filter((t) => t.due === key).length + state.events.filter((e) => e.date === key).length; return `<button class="day-tile ${key === today ? 'today' : ''}" data-action="select-day" data-date="${key}"><span class="day-name">周${DAY_NAMES[day.getDay() === 0 ? 6 : day.getDay() - 1]}</span><span class="day-num">${day.getDate()}</span><span class="day-dots">${count ? '<i></i>'.repeat(Math.min(count, 3)) : ''}</span></button>`; }).join('')}</div></div>
        <div class="card"><div class="card-header"><h3>今日习惯</h3><button class="muted-link" data-action="go-view" data-view="habits">管理习惯 →</button></div><div class="habit-preview">${todayHabits.length ? todayHabits.slice(0, 4).map(({ habit, done: isDone }) => `<div class="habit-line"><span class="habit-emoji">${escapeHtml(habit.emoji || '✦')}</span><span>${escapeHtml(habit.name)}</span><span class="habit-streak">${getStreak(habit)} 天</span><button class="habit-check ${isDone ? 'checked' : ''}" data-action="toggle-habit" data-id="${habit.id}" aria-label="${isDone ? '取消打卡' : '完成打卡'}">${isDone ? '✓' : ''}</button></div>`).join('') : '<div class="empty-state"><span class="empty-icon">◒</span>还没有习惯，先添加一个吧。</div>'}</div></div></div>
      <div class="grid two-col"><div class="card"><div class="card-header"><h3>今日待办</h3><button class="muted-link" data-action="go-view" data-view="planner">查看全部 →</button></div><div class="task-list">${todayTasks.length ? todayTasks.slice(0, 5).map((t) => taskRow(t, true)).join('') : '<div class="empty-state"><span class="empty-icon">✓</span>今天没有到期任务，享受轻松的一天。</div>'}</div></div><div class="card"><div class="card-header"><h3>近期目标</h3><button class="muted-link" data-action="go-view" data-view="insights">看统计 →</button></div><div class="milestone-list">${state.goals.slice(0, 3).map((goal) => `<div class="milestone"><div class="milestone-top"><strong>${escapeHtml(goal.title)}</strong><span>${goal.progress || 0}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${clamp(Number(goal.progress) || 0, 0, 100)}%"></div></div></div>`).join('')}</div></div></div>`;
  }

  function renderPlanner() {
    const filtered = state.tasks.filter((task) => {
      const matchesSearch = !searchTerm || `${task.title} ${task.nextStep || ''} ${taskSteps(task).map((step) => step.text).join(' ')} ${task.desc || ''} ${task.category}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = plannerFilter === 'all' || (plannerFilter === 'todo' && task.status !== 'done') || (plannerFilter === 'done' && task.status === 'done') || (plannerFilter === 'overdue' && task.status !== 'done' && task.due < todayKey());
      return matchesSearch && matchesFilter;
    }).sort((a, b) => {
      const statusOrder = (a.status === 'done') - (b.status === 'done');
      if (statusOrder) return statusOrder;
      if (plannerSort === 'priority') {
        const rank = { high: 0, medium: 1, low: 2 };
        return (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3) || String(a.due || '').localeCompare(String(b.due || ''));
      }
      return String(a.due || '').localeCompare(String(b.due || '')) || String(a.time || '').localeCompare(String(b.time || ''));
    });
    const groups = {};
    filtered.forEach((task) => { const key = task.due || 'none'; (groups[key] ||= []).push(task); });
    return `${viewHeading('Plan & do', '计划与任务', '把学期目标拆成今天可以完成的小步；每项任务都写清下一步行动。', '<button class="btn btn-ghost" data-action="new-goal">＋ 学期目标</button><button class="btn btn-primary" data-action="new-task">＋ 新建任务</button>')}
      <div class="toolbar"><div class="segmented" role="group" aria-label="任务筛选">${[['all', '全部'], ['todo', '待完成'], ['done', '已完成'], ['overdue', '已逾期']].map(([value, label]) => `<button class="${plannerFilter === value ? 'active' : ''}" data-action="planner-filter" data-filter="${value}" aria-pressed="${plannerFilter === value}">${label}</button>`).join('')}</div><div class="heading-actions"><select class="select" data-action="sort-tasks" aria-label="排序任务"><option value="due" ${plannerSort === 'due' ? 'selected' : ''}>按截止日期</option><option value="priority" ${plannerSort === 'priority' ? 'selected' : ''}>按优先级</option></select><button class="btn btn-ghost btn-sm" data-action="export-csv">导出 CSV</button></div></div>
      <div class="planner-columns"><div class="card"><div class="card-header"><h3>${filtered.length} 项任务</h3><span class="tag teal">${state.tasks.filter((t) => t.status === 'done').length} 已完成</span></div>${Object.keys(groups).length ? Object.entries(groups).map(([key, items]) => `<div class="plan-group"><div class="plan-date ${key === todayKey() ? 'today-label' : ''}">${key === 'none' ? '未设置日期' : formatDate(key, { month: 'long', day: 'numeric', weekday: 'short' })}<span class="tag ${key < todayKey() ? 'orange' : ''}">${key === 'none' ? '' : relativeDue(key)}</span></div>${items.map((task) => `<div class="plan-item" data-task-id="${task.id}"><button class="task-check ${task.status === 'done' ? 'done' : ''}" data-action="toggle-task" data-id="${task.id}" aria-label="切换完成状态">${task.status === 'done' ? '✓' : ''}</button><div class="priority-dot ${task.priority || 'low'}"></div><div class="plan-copy"><strong class="${task.status === 'done' ? 'done' : ''}">${escapeHtml(task.title)}</strong><p><b>${task.status === 'done' ? '完成进度：' : '现在做：'}</b>${escapeHtml(task.status === 'done' ? `全部 ${taskSteps(task).length || 1} 步` : taskNextStep(task))}</p>${task.desc && task.desc !== task.nextStep ? `<small class="plan-note">${escapeHtml(task.desc)}</small>` : ''}<span class="plan-meta">${escapeHtml(task.category || '未分类')}${taskStepProgress(task) ? ` · ${taskStepProgress(task)}` : ''}</span></div>${task.status !== 'done' && taskSteps(task).some((step) => !step.done) ? `<button class="btn btn-ghost btn-xs" data-action="advance-task" data-id="${task.id}">完成此步</button>` : ''}<button class="icon-btn subtle" data-action="edit-task" data-id="${task.id}" aria-label="编辑任务">✎</button></div>`).join('')}</div>`).join('') : '<div class="empty-state"><span class="empty-icon">✓</span>没有符合条件的任务。<br /><button class="btn btn-ghost btn-sm" data-action="new-task">创建第一项</button></div>'}</div>
        <div class="card"><div class="card-header"><h3>学期目标</h3><button class="muted-link" data-action="new-goal">＋ 添加</button></div><div class="milestone-list">${state.goals.length ? state.goals.map((goal) => `<div class="milestone"><div class="milestone-top"><strong>${escapeHtml(goal.title)}</strong><span>${goal.progress || 0}%</span></div><p class="form-hint">${escapeHtml(goal.target || '')} · 截止 ${formatShort(goal.due)}</p><div class="progress-track"><div class="progress-fill" style="width:${clamp(Number(goal.progress) || 0, 0, 100)}%"></div></div><div class="item-actions" style="opacity:1;margin-top:8px"><button class="btn btn-ghost btn-sm" data-action="edit-goal" data-id="${goal.id}">编辑</button><button class="btn btn-ghost btn-sm" data-action="delete-goal" data-id="${goal.id}">删除</button></div></div>`).join('') : '<div class="empty-state">还没有目标，给这个学期一个方向吧。</div>'}</div></div></div>`;
  }

  function renderTimetable() {
    const weekStart = currentWeek;
    const weekEnd = addDays(weekStart, 6);
    const weekLabel = `${weekStart.getFullYear()} / ${weekStart.getMonth() + 1} / ${weekStart.getDate()} — ${weekEnd.getMonth() + 1} / ${weekEnd.getDate()}`;
    const today = todayKey();
    const dayHeads = DAY_NAMES.map((name, index) => { const date = dateKey(addDays(weekStart, index)); return `<div class="week-day-head ${date === today ? 'today' : ''}">周${name}<strong>${dateFromKey(date).getDate()}</strong></div>`; }).join('');
    const semesterStart = safeDateKey(state.profile?.startDate);
    const previewOnly = Boolean(semesterStart && dateKey(weekEnd) < semesterStart);
    const representativeDate = semesterStart && dateKey(weekStart) < semesterStart && dateKey(weekEnd) >= semesterStart ? dateFromKey(semesterStart) : weekStart;
    const semesterWeek = getSemesterWeek(representativeDate);
    const findCourse = (dayIndex, period) => {
      const occurrenceDate = addDays(weekStart, dayIndex);
      return state.courses.find((item) => Number(item.day) === dayIndex + 1
        && Number(item.period) <= period
        && Number(item.period) + Math.max(1, Number(item.duration) || 1) > period
        && courseRunsOnDate(item, occurrenceDate, previewOnly));
    };
    const cells = PERIODS.map((period) => `<div class="period-label"><strong>${period.id}</strong><span>${period.time.split('–')[0]}</span></div>${DAY_NAMES.map((_, index) => {
      const course = findCourse(index, period.id);
      const isStart = course && Number(course.period) === period.id;
      const courseId = course ? escapeHtml(course.id) : '';
      return `<div class="period-cell" data-day="${index + 1}" data-period="${period.id}">${course ? `<button class="course-block ${course.color || 'teal'} ${isStart ? '' : 'course-continuation'}" data-action="edit-course" data-id="${courseId}" aria-label="编辑${escapeHtml(course.name)}"><strong>${isStart ? escapeHtml(course.name) : '↳ ' + escapeHtml(course.name)}</strong><span>${escapeHtml(course.room || '待定')} · ${escapeHtml(course.teacher || '')}</span></button>` : `<button class="course-add" data-action="new-course" data-day="${index + 1}" data-period="${period.id}" aria-label="添加课程">＋</button>`}</div>`;
    }).join('')}`).join('');
    const activeDayIndex = clamp(Number(mobileTimetableDay) || 0, 0, DAY_NAMES.length - 1);
    mobileTimetableDay = activeDayIndex;
    const activeDayKey = dateKey(addDays(weekStart, activeDayIndex));
    const activeDayCourses = state.courses.filter((course) => Number(course.day) === activeDayIndex + 1 && courseRunsOnDate(course, addDays(weekStart, activeDayIndex), previewOnly));
    const mobileDayTabs = DAY_NAMES.map((name, index) => {
      const date = dateKey(addDays(weekStart, index));
      const hasCourses = state.courses.some((course) => Number(course.day) === index + 1 && courseRunsOnDate(course, addDays(weekStart, index), previewOnly));
      const active = index === activeDayIndex;
      return `<button class="mobile-day-tab ${active ? 'active' : ''} ${date === today ? 'today' : ''} ${hasCourses ? 'has-courses' : ''}" data-action="timetable-day" data-day-index="${index}" role="tab" aria-selected="${active}" aria-label="查看周${name} ${date}"><span>周${name}</span><strong>${dateFromKey(date).getDate()}</strong><em aria-hidden="true"></em></button>`;
    }).join('');
    const mobilePeriodRows = PERIODS.map((period) => {
      const course = findCourse(activeDayIndex, period.id);
      const isStart = course && Number(course.period) === period.id;
      const duration = course ? Math.max(1, Number(course.duration) || 1) : 1;
      const endPeriod = course ? Math.min(PERIODS.length, Number(course.period) + duration - 1) : period.id;
      let slot;
      if (!course) {
        slot = `<button class="mobile-period-empty" data-action="new-course" data-day="${activeDayIndex + 1}" data-period="${period.id}" aria-label="在周${DAY_NAMES[activeDayIndex]}第${period.id}节添加课程"><span>＋ 添加课程</span></button>`;
      } else {
        const courseId = escapeHtml(course.id);
        const title = isStart ? escapeHtml(course.name) : `↳ ${escapeHtml(course.name)}`;
        const detail = isStart ? `${escapeHtml(course.room || '待定')} · ${escapeHtml(course.teacher || '')}` : `续上 · 第 ${course.period}–${endPeriod} 节`;
        slot = `<button class="mobile-course-block ${course.color || 'teal'} ${isStart ? '' : 'course-continuation'}" data-action="edit-course" data-id="${courseId}" aria-label="编辑${escapeHtml(course.name)}"><strong>${title}</strong><span>${detail}</span>${isStart && duration > 1 ? `<small>连上 ${duration} 节 · ${PERIODS[Number(course.period) - 1]?.time || ''}</small>` : ''}</button>`;
      }
      return `<div class="mobile-period-row"><div class="mobile-period-meta"><strong>${period.id}</strong><span>${period.time.split('–')[0]}</span></div><div class="mobile-period-slot">${slot}</div></div>`;
    }).join('');
    const mobileDayLabel = `周${DAY_NAMES[activeDayIndex]} · ${formatShort(activeDayKey)}`;
    const thisWeek = startOfWeek(new Date()).getTime() === weekStart.getTime();
    const weekLabelText = semesterWeek === 0 ? '开学前' : semesterWeek > (Number(state.profile.totalWeeks) || 20) ? '学期已结束' : `第 ${semesterWeek} 周`;
    return `${viewHeading('Timetable', '我的课表', `${thisWeek ? '本周' : '自定义周'} · ${weekLabelText} · 点击空白格添加课程`, '<button class="btn btn-ghost" data-action="go-current-week">回到本周</button><button class="btn btn-primary" data-action="new-course">＋ 添加课程</button>')}
      <div class="card timetable-card"><div class="timetable-head"><div class="week-nav"><button class="icon-btn" data-action="week-prev" aria-label="上一周">‹</button><strong>${weekLabel}</strong><button class="icon-btn" data-action="week-next" aria-label="下一周">›</button></div><div class="heading-actions"><button class="btn btn-ghost btn-sm" data-action="ocr-import">▧ 截图识别</button><button class="btn btn-ghost btn-sm" data-action="export-csv">导出表格</button><button class="btn btn-ghost btn-sm" data-action="open-updates">更新中心</button></div></div><div class="week-grid"><div class="week-corner"></div>${dayHeads}${cells}</div><div class="timetable-mobile"><div class="mobile-day-switcher" role="tablist" aria-label="选择课表日期">${mobileDayTabs}</div><div class="mobile-day-caption"><strong>${mobileDayLabel}</strong><span>${activeDayCourses.length ? `${activeDayCourses.length} 门课程` : '暂无课程'}</span></div><div class="mobile-period-list">${mobilePeriodRows}</div></div><div class="course-summary"><div class="summary-pill"><strong>${state.courses.length}</strong><span>门课程</span></div><div class="summary-pill"><strong>${state.courses.reduce((sum, course) => sum + (Number(course.credits) || 0), 0)}</strong><span>学分</span></div><div class="summary-pill"><strong>${state.courses.filter((course) => course.day <= 5).length}</strong><span>工作日课程</span></div></div></div>`;
  }

  function renderCalendar() {
    const monthStart = startOfMonth(calendarCursor);
    const firstDay = (monthStart.getDay() || 7) - 1;
    const daysInMonth = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 0).getDate();
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    const cells = Array.from({ length: totalCells }, (_, index) => {
      const day = index - firstDay + 1;
      const date = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), day);
      const key = dateKey(date);
      const inMonth = date.getMonth() === calendarCursor.getMonth();
      const eventItems = state.events.filter((event) => !event.autoGenerated && event.date === key);
      const taskItems = state.settings.autoEvent === true
        ? state.tasks.filter((task) => task.status !== 'done' && task.due === key).map((task) => ({ ...task, title: task.title, type: '任务' }))
        : [];
      const items = [...eventItems, ...taskItems];
      return `<button class="calendar-cell ${inMonth ? '' : 'muted'} ${key === todayKey() ? 'today' : ''}" data-action="calendar-day" data-date="${key}"><span class="calendar-day-num">${date.getDate()}</span><span class="calendar-items">${items.slice(0, 3).map((item) => `<i class="${item.color || 'teal'}" title="${escapeHtml(item.title)}"></i>`).join('')}</span></button>`;
    }).join('');
    const upcomingEnd = dateKey(addDays(dateFromKey(todayKey()), 6));
    const upcomingTasks = state.settings.autoEvent === true
      ? state.tasks.filter((task) => task.status !== 'done' && task.due).map((task) => ({ ...task, title: task.title, date: task.due, time: task.time, kind: '任务' }))
      : [];
    const upcoming = [...state.events.filter((event) => !event.autoGenerated).map((event) => ({ ...event, kind: '事件' })), ...upcomingTasks].filter((item) => item.date >= todayKey() && item.date <= upcomingEnd).sort((a, b) => a.date.localeCompare(b.date) || String(a.time || '').localeCompare(String(b.time || ''))).slice(0, 8);
    return `${viewHeading('Calendar', '日历', '考试、截止日期和生活安排都在这里，先看全局再排今天。', '<button class="btn btn-ghost" data-action="calendar-today">今天</button><button class="btn btn-primary" data-action="new-event">＋ 新建事件</button>')}
      <div class="calendar-layout"><div class="card calendar-card"><div class="calendar-toolbar"><button class="icon-btn" data-action="month-prev" aria-label="上个月">‹</button><h2>${calendarCursor.getFullYear()} 年 ${calendarCursor.getMonth() + 1} 月</h2><button class="icon-btn" data-action="month-next" aria-label="下个月">›</button></div><div class="calendar-week-head">${DAY_NAMES.map((name) => `<span>周${name}</span>`).join('')}</div><div class="calendar-grid">${cells}</div></div><div class="card"><div class="card-header"><h3>未来 7 天</h3><span class="tag teal">${upcoming.length} 项</span></div><div class="upcoming-list">${upcoming.length ? upcoming.map((item) => `<button class="upcoming-item" data-action="${item.kind === '任务' ? 'edit-task' : 'calendar-day'}" data-id="${item.kind === '任务' ? item.id : ''}" data-date="${item.date}" data-event-id="${item.kind === '事件' ? item.id : ''}"><span class="upcoming-date">${formatShort(item.date)}<small>${item.time || '全天'}</small></span><span class="upcoming-copy"><strong>${escapeHtml(item.title)}</strong><small>${item.kind} · ${escapeHtml(item.place || item.category || '未分类')}</small></span><span class="upcoming-arrow">›</span></button>`).join('') : '<div class="empty-state">未来 7 天没有安排。</div>'}</div></div></div>`;
  }

  function renderHabits() {
    const today = todayKey();
    const week = Array.from({ length: 7 }, (_, i) => dateKey(addDays(startOfWeek(new Date()), i)));
    const streakDays = Array.from({ length: 14 }, (_, i) => dateKey(addDays(startOfWeek(new Date()), i - 7)));
    const totalChecks = state.habits.reduce((sum, habit) => sum + week.filter((key) => habit.logs && habit.logs[key]).length, 0);
    const possible = Math.max(1, state.habits.length * 7);
    const rate = Math.round(totalChecks / possible * 100);
    return `${viewHeading('Daily rhythm', '日常习惯', '让好状态变成默认选项，也给今天的自己一点肯定。', '<button class="btn btn-ghost" data-action="daily-log">＋ 今日记录</button><button class="btn btn-primary" data-action="new-habit">＋ 添加习惯</button>')}
      <div class="habits-layout"><div class="card"><div class="card-header"><h3>今日清单</h3><span class="tag teal">${state.habits.filter((h) => h.logs && h.logs[today]).length}/${state.habits.length}</span></div><div class="habit-card-list">${state.habits.length ? state.habits.map((habit) => { const checked = Boolean(habit.logs && habit.logs[today]); const last7 = week.map((key) => habit.logs && habit.logs[key]); const percent = Math.round(last7.filter(Boolean).length / 7 * 100); return `<div class="habit-card-row"><span class="habit-large-icon">${escapeHtml(habit.emoji || '✦')}</span><div class="habit-card-copy"><strong>${escapeHtml(habit.name)}</strong><span>${escapeHtml(habit.target || '每天一点点')} · 连续 ${getStreak(habit)} 天</span><span class="habit-week">${week.map((key, index) => `<i class="${habit.logs && habit.logs[key] ? 'on' : ''} ${key === today ? 'today' : ''}" title="周${DAY_NAMES[index]} ${key}"></i>`).join('')}</span></div><div class="habit-score"><strong>${percent}%</strong><span>本周</span></div><button class="habit-check ${checked ? 'checked' : ''}" data-action="toggle-habit" data-id="${habit.id}" aria-label="${checked ? '取消今天打卡' : '今天打卡'}">${checked ? '✓' : ''}</button><button class="icon-btn subtle" data-action="edit-habit" data-id="${habit.id}" aria-label="编辑习惯">✎</button></div>`; }).join('') : '<div class="empty-state"><span class="empty-icon">◒</span>还没有习惯，先添加一个让生活更顺手。</div>'}</div></div><div><div class="card streak-card"><div class="eyebrow">This week</div><h3 style="margin:4px 0 0">坚持的轨迹</h3><div class="streak-number"><strong>${getMaxStreak()}</strong><span>天最长连续</span></div><p>本周完成率 ${rate}% · 每一次打卡都算数。</p><div class="streak-calendar">${streakDays.map((key) => `<i class="${state.habits.some((h) => h.logs && h.logs[key]) ? 'on' : ''} ${key === today ? 'today' : ''}">${dateFromKey(key).getDate()}</i>`).join('')}</div></div><div class="card card-pad" style="margin-top:18px"><div class="card-header" style="padding:0"><h3>今日状态</h3><button class="muted-link" data-action="daily-log">编辑</button></div><div class="daily-metrics"><div><span>💧 饮水</span><strong>${state.daily.water || 0}/${state.daily.waterGoal || 8} 杯</strong></div><div><span>😌 心情</span><strong>${escapeHtml(state.daily.mood || '未记录')}</strong></div><div><span>🛌 睡眠</span><strong>${escapeHtml(state.daily.sleep || '未记录')}</strong></div></div></div></div></div>`;
  }

  function renderNotes() {
    const notes = state.notes.slice().filter((note) => !searchTerm || `${note.title} ${note.content}`.toLowerCase().includes(searchTerm.toLowerCase())).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    const selected = notes.find((note) => note.id === selectedNoteId) || notes[0];
    if (selected) selectedNoteId = selected.id;
    return `${viewHeading('Capture ideas', '灵感笔记', '把一闪而过的想法留下来，给未来的自己更多选择。', '<button class="btn btn-primary" data-action="new-note">＋ 新建笔记</button>')}
      <div class="notes-layout"><div class="card"><div class="card-header"><h3>全部笔记</h3><span class="tag orange">${notes.length} 篇</span></div><div class="notes-list">${notes.length ? notes.map((note) => `<div class="note-item ${note.id === selectedNoteId ? 'selected' : ''}" data-action="select-note" data-id="${note.id}" role="button" tabindex="0" aria-pressed="${note.id === selectedNoteId}" aria-label="选择笔记：${escapeHtml(note.title)}"><span class="note-pin" aria-hidden="true">${note.pinned ? '★' : '✦'}</span><div class="note-copy"><strong>${escapeHtml(note.title)}</strong><p>${escapeHtml(note.content)}</p><time>${formatDate(dateKey(new Date(note.updatedAt)), { month: 'numeric', day: 'numeric' })}</time></div><div class="item-actions"><button class="icon-btn subtle" data-action="edit-note" data-id="${note.id}" aria-label="编辑笔记：${escapeHtml(note.title)}">✎</button></div></div>`).join('') : '<div class="empty-state"><span class="empty-icon">▤</span>写下第一条笔记吧。</div>'}</div></div><div class="note-editor-card"><div class="quote-mark">“</div>${selected ? `<div class="eyebrow">${selected.pinned ? 'Pinned note' : 'Note'}</div><h3>${escapeHtml(selected.title)}</h3><p>${escapeHtml(selected.content)}</p><button class="btn btn-ghost btn-sm" style="margin-top:18px" data-action="edit-note" data-id="${selected.id}">编辑这条笔记</button>` : '<h3>从一个念头开始</h3><p>记录课程灵感、项目想法或此刻的心情。</p><button class="btn btn-ghost btn-sm" style="margin-top:18px" data-action="new-note">写下来</button>'}</div></div>`;
  }

  function renderInsights() {
    const done = state.tasks.filter((task) => task.status === 'done').length;
    const overdue = state.tasks.filter((task) => task.status !== 'done' && task.due && task.due < todayKey()).length;
    const taskRate = state.tasks.length ? Math.round(done / state.tasks.length * 100) : 0;
    const week = Array.from({ length: 7 }, (_, i) => dateKey(addDays(startOfWeek(new Date()), i)));
    const trend = week.map((key) => state.tasks.filter((t) => t.due === key && t.status === 'done').length);
    const max = Math.max(1, ...trend);
    const habitTotal = state.habits.reduce((sum, h) => sum + week.filter((key) => h.logs && h.logs[key]).length, 0);
    const focusMinutes = Math.round(Number(state.focus.totalMinutes) || 0);
    return `${viewHeading('Insights', '学习统计', '用数据看见自己的节奏，复盘不是给自己打分。', '<button class="btn btn-ghost" data-action="export-csv">导出数据</button><button class="btn btn-primary" data-action="weekly-review">写周复盘</button>')}
      <div class="grid stats-grid insight-stats">${statCard('✓', `${taskRate}%`, '任务完成率', 'teal')}${statCard('!', `${overdue}`, '待处理逾期', 'orange')}${statCard('◒', `${habitTotal}`, '本周习惯打卡', 'purple')}${statCard('◷', `${focusMinutes}m`, '累计专注时长', 'blue')}</div>
      <div class="insights-grid"><div class="card card-pad"><div class="card-header" style="padding:0"><h3>每日完成趋势</h3><span class="form-hint">仅统计已完成任务</span></div><div class="trend-chart">${trend.map((value, index) => `<div class="trend-col"><div class="trend-bar" style="height:${Math.max(8, value / max * 100)}%" title="${value} 项"></div><span>${DAY_NAMES[index]}</span></div>`).join('')}</div></div><div class="card card-pad"><div class="card-header" style="padding:0"><h3>目标进度</h3><span class="form-hint">本学期</span></div><div class="insight-goals">${state.goals.map((goal) => `<div class="insight-goal"><div><strong>${escapeHtml(goal.title)}</strong><span>${goal.progress || 0}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${clamp(Number(goal.progress) || 0, 0, 100)}%"></div></div></div>`).join('')}</div></div></div>
      <div class="card card-pad review-card"><div><div class="eyebrow">Weekly review</div><h3>这一周，什么值得被记住？</h3><p>写下完成、阻塞和下周承诺，周一再回来看看。</p></div><button class="btn btn-ghost" data-action="weekly-review">开始复盘 →</button></div>`;
  }

  function renderFocus() {
    const focus = getFocusSnapshot();
    const minutes = Math.floor(focus.remaining / 60);
    const seconds = focus.remaining % 60;
    const tasks = state.tasks.filter((task) => task.status !== 'done');
    const focusMinutes = Math.round(Number(state.focus.totalMinutes) || 0);
    return `${viewHeading('Focus mode', '专注计时', '选择一个任务，给它一段不被打断的时间。', '<button class="btn btn-ghost" data-action="focus-settings">调整时长</button>')}
      <div class="focus-layout"><div class="card focus-timer-card"><div class="focus-orbit"><div class="focus-time" id="focus-time">${pad(minutes)}:${pad(seconds)}</div><span>${focus.running ? '正在专注' : '准备好了吗？'}</span></div><div class="focus-controls"><button class="btn btn-primary" data-action="focus-toggle">${focus.running ? '暂停' : '开始专注'}</button><button class="btn btn-ghost" data-action="focus-reset">重置</button></div><p class="form-hint">完成一轮后会自动记录当前时长；切换页面也不会丢失进度。</p></div><div class="card card-pad"><div class="card-header" style="padding:0"><h3>本轮专注任务</h3><span class="tag orange">${state.focus.sessions || 0} 次累计</span></div><select class="focus-task-select" data-action="focus-task" aria-label="选择专注任务"><option value="">自由专注</option>${tasks.map((task) => `<option value="${task.id}" ${state.focus.selectedTask === task.id ? 'selected' : ''}>${escapeHtml(task.title)}</option>`).join('')}</select><div class="focus-tips"><div><strong>${Math.round((state.focus.duration || 1500) / 60)} / 5</strong><span>当前节奏</span></div><div><strong>${Math.round(focusMinutes / 60 * 10) / 10}h</strong><span>累计时长</span></div></div></div></div>`;
  }

  function renderSettings() {
    const updated = state.updatedAt ? new Date(state.updatedAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    const reminderSettings = ensureReminderSettings();
    const notification = notificationStatus();
    const notificationAction = notification.supported && notification.permission === 'default' ? '<button class="btn btn-primary btn-sm" data-action="request-notification">授权设备通知</button>' : '';
    const notificationActionLabel = notification.permission === 'granted'
      ? '<div class="notification-actions"><span class="notification-state success">✓ 已授权</span><button class="btn btn-ghost btn-sm" data-action="test-notification">发送测试</button></div>'
      : notification.permission === 'denied'
        ? '<span class="notification-state error">需在浏览器或系统设置中允许</span>'
        : notificationAction;
    return `${viewHeading('Workspace', '设置', '调整你的学期、外观与数据备份。', '<button class="btn btn-primary" data-action="save-settings">保存设置</button>')}
      <div class="settings-grid">
        <div class="card card-pad">
          <div class="settings-section"><div class="eyebrow">Profile</div><h3>个人与学期</h3>
            <div class="settings-row"><span><strong>${escapeHtml(state.profile.name || '同学')}</strong><small>${escapeHtml(state.profile.major || '未填写专业')}</small></span><button class="btn btn-ghost btn-sm" data-action="edit-profile">编辑</button></div>
            <div class="settings-row"><span><strong>${escapeHtml(state.profile.term || '大二上学期')}</strong><small>开学日 ${formatShort(state.profile.startDate)} · ${state.profile.totalWeeks || 20} 周</small></span><button class="btn btn-ghost btn-sm" data-action="edit-semester">调整</button></div>
          </div>
          <div class="settings-section"><div class="eyebrow">Appearance</div><h3>外观与提醒</h3>
            <label class="setting-control"><span>深色模式</span><input type="checkbox" data-setting="theme" ${state.settings.theme === 'dark' ? 'checked' : ''} /><i></i></label>
            <label class="setting-control"><span>任务到期时自动加入日历</span><input type="checkbox" data-setting="autoEvent" ${state.settings.autoEvent ? 'checked' : ''} /><i></i></label>
            <label class="setting-control"><span>未完成任务提醒（站内）</span><input type="checkbox" data-setting="reminderEnabled" ${reminderSettings.reminderEnabled ? 'checked' : ''} /><i></i></label>
            <label class="setting-control"><span>设备通知（手机 / 电脑）</span><input type="checkbox" data-setting="notifications" ${state.settings.notifications === true && notification.permission === 'granted' ? 'checked' : ''} /><i></i></label>
            <div class="reminder-frequency"><label for="reminder-interval">定时检查频率</label><select id="reminder-interval" class="select" data-setting-value="reminderInterval"><option value="15" ${reminderSettings.reminderInterval === 15 ? 'selected' : ''}>每 15 分钟</option><option value="30" ${reminderSettings.reminderInterval === 30 ? 'selected' : ''}>每 30 分钟</option><option value="60" ${reminderSettings.reminderInterval === 60 ? 'selected' : ''}>每 60 分钟</option></select></div>
            <div class="notification-permission"><div><strong>系统通知权限</strong><small>${escapeHtml(notification.label)}。Android 和电脑可直接授权；iPhone / iPad 需先添加到主屏幕。网页关闭后定时器不会运行，重新打开时会立即补查。</small></div>${notificationActionLabel || reminderNotificationAction(false)}</div>
          </div>
        </div>
        <div>
          <div class="card card-pad"><div class="eyebrow">Backup & sync</div><h3>数据安全</h3><p class="settings-copy">最后保存：${updated}<br />数据只在本机保存，建议每周导出一次备份。</p><div class="settings-actions"><button class="btn btn-primary" data-action="export-json">↓ 导出 JSON 备份</button><button class="btn btn-ghost" data-action="import-json">↑ 导入备份</button><button class="btn btn-ghost" data-action="export-csv">导出课表 CSV</button></div></div>
          <div class="card card-pad update-card"><div class="eyebrow">Update center</div><h3>CampusFlow ${APP_VERSION}</h3><p class="settings-copy">最近更新：任务日历自动清理、浏览器前进后退、专注恢复、移动端无障碍与极窄屏优化。</p><button class="btn btn-ghost btn-sm" data-action="check-update">检查更新</button><span class="update-time">本地数据版本 ${state.schemaVersion || 1} · ${updated}</span></div>
          <div class="card card-pad shortcuts-card"><div class="eyebrow">Shortcuts</div><h3>快捷键</h3><div class="shortcut-row"><kbd>N</kbd><span>新建任务</span><kbd>T</kbd><span>回到今天</span></div><div class="shortcut-row"><kbd>⌘/Ctrl K</kbd><span>聚焦搜索</span><kbd>Esc</kbd><span>关闭弹窗</span></div></div>
        </div>
      </div>`;
  }

  function getWeekNumber(date) {
    const d = new Date(date);
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.max(1, Math.ceil((((d - start) / 86400000) + start.getDay() + 1) / 7));
  }

  function getSemesterWeek(date) {
    const start = state.profile && state.profile.startDate ? dateFromKey(state.profile.startDate) : null;
    if (!start) return getWeekNumber(date);
    const targetWeek = startOfWeek(date).getTime();
    const semesterStart = startOfWeek(start).getTime();
    if (targetWeek < semesterStart) return 0;
    return Math.floor((targetWeek - semesterStart) / (7 * 86400000)) + 1;
  }

  function chineseWeekNumber(value) {
    const ascii = String(value || '').replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xFF10));
    if (/^\d+$/.test(ascii)) return Number(ascii);
    const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (!ascii.includes('十')) {
      const converted = Array.from(ascii).map((char) => digits[char]);
      return converted.every((number) => Number.isFinite(number)) ? Number(converted.join('')) : NaN;
    }
    const [tensText, unitsText] = ascii.split('十');
    const tens = tensText ? digits[tensText] : 1;
    const units = unitsText ? digits[unitsText] : 0;
    return Number.isFinite(tens) && Number.isFinite(units) ? tens * 10 + units : NaN;
  }

  function normalizeWeekText(value) {
    return String(value || '').trim()
      .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xFF10))
      .replace(/[–—−－﹣~～]/g, '-')
      .replace(/[至到]/g, '-')
      .replace(/[，、；;]/g, ',')
      .replace(/[零〇一二两三四五六七八九十]+/g, (token) => {
        const parsed = chineseWeekNumber(token);
        return Number.isFinite(parsed) ? String(parsed) : token;
      })
      .replace(/\s+/g, ' ');
  }

  function normalizeWeekRule(value) {
    const rule = normalizeWeekText(value);
    const parity = rule.includes('单周') ? '单周' : rule.includes('双周') ? '双周' : '';
    const numberRule = rule.replace(/[单双]周/g, '').replace(/[第周]/g, ' ');
    const matches = Array.from(numberRule.matchAll(/(\d+)(?:\s*-\s*(\d+))?/g));
    if (!matches.length) return parity || '1-16';
    const ranges = matches.map((match) => {
      const first = clamp(Number(match[1]), 1, 99);
      if (!match[2]) return String(first);
      const second = clamp(Number(match[2]), 1, 99);
      return `${Math.min(first, second)}-${Math.max(first, second)}`;
    });
    const base = Array.from(new Set(ranges)).join(',');
    return `${base}${parity ? ` ${parity}` : ''}`;
  }

  function getNextCourse() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    for (let offset = 0; offset < 21; offset += 1) {
      const date = addDays(now, offset);
      if (state.profile?.startDate && dateKey(date) < state.profile.startDate) continue;
      const day = date.getDay() || 7;
      const weekNumber = getSemesterWeek(date);
      const candidates = state.courses
        .filter((course) => Number(course.day) === day && courseRunsThisWeek(course, weekNumber))
        .sort((a, b) => Number(a.period) - Number(b.period));
      const course = candidates.find((item) => {
        if (offset > 0) return true;
        const start = PERIODS[(Number(item.period) || 1) - 1]?.time?.split('–')[0];
        return timeToMinutes(start) >= currentMinutes;
      });
      if (course) return { ...course, occurrenceDate: dateKey(date) };
    }
    return null;
  }

  function courseRunsThisWeek(course, weekNumber) {
    // 开学前用于预览课表；开学后支持 1-16、单周/双周等常见写法。
    if (!course || weekNumber === 0 || !course.weeks) return true;
    const week = Math.floor(Number(weekNumber));
    const totalWeeks = clamp(Math.round(Number(state.profile?.totalWeeks) || 20), 1, 40);
    if (!Number.isFinite(week) || week < 1 || week > totalWeeks) return false;
    const rule = normalizeWeekText(course.weeks).toLowerCase();
    if (rule.includes('单周') && week % 2 !== 1) return false;
    if (rule.includes('双周') && week % 2 !== 0) return false;
    const weekRule = rule.replace(/[单双]周/g, '').replace(/[第周]/g, ' ');
    const matches = Array.from(weekRule.matchAll(/(\d+)\s*-\s*(\d+)|(\d+)/g));
    if (!matches.length) return true;
    return matches.some((match) => match[3]
      ? week === Number(match[3])
      : week >= Math.min(Number(match[1]), Number(match[2])) && week <= Math.max(Number(match[1]), Number(match[2])));
  }

  function courseRunsOnDate(course, date, allowPreview) {
    const key = dateKey(date);
    const startDate = safeDateKey(state.profile?.startDate);
    if (startDate && key < startDate) return Boolean(allowPreview);
    return courseRunsThisWeek(course, getSemesterWeek(date));
  }

  function coursesOverlap(first, second) {
    if (Number(first.day) !== Number(second.day)) return false;
    const firstStart = Number(first.period) || 1;
    const secondStart = Number(second.period) || 1;
    const firstEnd = firstStart + Math.max(1, Number(first.duration) || 1) - 1;
    const secondEnd = secondStart + Math.max(1, Number(second.duration) || 1) - 1;
    if (firstEnd < secondStart || secondEnd < firstStart) return false;
    for (let week = 1; week <= 40; week += 1) {
      if (courseRunsThisWeek(first, week) && courseRunsThisWeek(second, week)) return true;
    }
    return false;
  }

  // ---------- 课表截图 OCR 导入 ----------
  // Tesseract.js 是按需加载的，只有用户主动点击“截图识别”才会请求 CDN。
  // 图片与识别结果始终留在当前浏览器，不会发送到第三方 OCR 服务。
  let tesseractPromise = null;
  let activeOcrWorker = null;
  let ocrRunId = 0;

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractPromise) return tesseractPromise;
    tesseractPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-campusflow-ocr]');
      // A previous failed script element must not poison every later retry.
      if (existing) existing.remove();
      const script = document.createElement('script');
      script.src = OCR_SCRIPT_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.campusflowOcr = 'true';
      script.onload = () => {
        if (window.Tesseract) resolve(window.Tesseract);
        else {
          script.remove();
          tesseractPromise = null;
          reject(new Error('OCR 引擎加载失败，请重试'));
        }
      };
      script.onerror = () => {
        script.remove();
        tesseractPromise = null;
        reject(new Error('无法加载 OCR 引擎，请检查网络后重试'));
      };
      document.head.appendChild(script);
    });
    return tesseractPromise;
  }

  function updateOcrProgress(message, progress) {
    const label = $('#ocr-progress-label');
    const bar = $('#ocr-progress-bar');
    const value = clamp(Number(progress) || 0, 0, 1);
    if (label && message) label.textContent = message;
    if (bar) bar.value = Math.round(value * 100);
  }

  function ocrProgressBody() {
    return `<div class="ocr-progress" role="status" aria-live="polite"><div class="ocr-progress-icon">▧</div><h3>正在识别课表截图</h3><p id="ocr-progress-label">正在加载本地 OCR 引擎…</p><progress id="ocr-progress-bar" value="0" max="100"></progress><p class="form-hint">首次使用需要下载中文识别模型，图片只在本机处理。</p><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button></div></div>`;
  }

  async function recognizeTimetableImage(file) {
    const Tesseract = await loadTesseract();
    const logger = (info) => {
      if (!info) return;
      const statusMap = { 'loading tesseract core': '加载 OCR 核心…', 'initializing tesseract': '初始化识别器…', 'loading language traineddata': '下载中文识别模型…', 'initializing api': '准备中文识别…', recognizing: '正在识别表格文字…' };
      updateOcrProgress(statusMap[info.status] || info.status || '正在识别…', info.progress);
    };
    // v5 API: language and OEM are passed while creating the worker.
    // Keep the pinned major version above so a future API change fails with a
    // useful retry message instead of silently running an English-only worker.
    const worker = await Tesseract.createWorker(['chi_sim', 'eng'], 1, { logger });
    activeOcrWorker = worker;
    try {
      if (worker.setParameters) await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' });
      // Tesseract v5 requires an explicit output request for layout/word boxes.
      // Without blocks, many builds return only text and spatial timetable parsing cannot run.
      const result = await worker.recognize(file, {}, { text: true, blocks: true });
      return result && result.data ? result.data : result;
    } finally {
      if (activeOcrWorker === worker) activeOcrWorker = null;
      if (worker && worker.terminate) {
        try { await worker.terminate(); } catch (error) { /* It may already be terminated after cancel. */ }
      }
    }
  }

  function normalizeOcrText(value) {
    return String(value == null ? '' : value)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u3000\u00a0]/g, ' ')
      .replace(/[|｜¦]/g, ' ')
      .replace(/[：]/g, ':')
      .replace(/[，]/g, ',')
      .replace(/[（）]/g, (char) => char === '（' ? '(' : ')')
      .split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n')
      .trim();
  }

  function compactOcrText(value) {
    return normalizeOcrText(value).replace(/\s+/g, '');
  }

  function chineseNumber(value) {
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 日: 7, 天: 7 };
    if (map[value]) return map[value];
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function dayFromOcrText(value) {
    const text = normalizeOcrText(value);
    const match = text.match(/(?:周|星期|礼拜)\s*([一二三四五六日天1-7])|\b(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i);
    if (!match) return null;
    if (match[1]) return chineseNumber(match[1]);
    const english = String(match[2]).slice(0, 3).toLowerCase();
    return { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 }[english] || null;
  }

  function periodFromOcrText(value) {
    const text = normalizeOcrText(value);
    // Only accept an explicit “第 1 节” marker or a standalone period number.
    // This avoids treating course codes such as CS204/MATH201 as row labels.
    const match = text.match(/(?:第\s*)?([一二三四五六七八九十]|\d{1,2})\s*(?:节|講|讲|次|时|時)/) || text.match(/^\s*([一二三四五六七八九十]|\d{1,2})\s*[.)、]?\s*$/);
    if (!match) return null;
    const period = chineseNumber(match[1]);
    return period && period >= 1 && period <= PERIODS.length ? period : null;
  }

  function ocrWordList(data) {
    const direct = Array.isArray(data && data.words) ? data.words : [];
    const nested = [];
    const blocks = Array.isArray(data && data.blocks) ? data.blocks : [];
    blocks.forEach((block) => {
      const paragraphs = Array.isArray(block && block.paragraphs) ? block.paragraphs : [];
      paragraphs.forEach((paragraph) => {
        const lines = Array.isArray(paragraph && paragraph.lines) ? paragraph.lines : [];
        lines.forEach((line) => {
          if (Array.isArray(line && line.words)) nested.push(...line.words);
        });
      });
    });
    // Some builds expose both data.words and nested blocks. Keep the direct form
    // when available to avoid inserting every word twice.
    const words = direct.length ? direct : nested;
    return words.map((word) => {
      const box = word && word.bbox ? word.bbox : {};
      const x0 = Number(box.x0) || 0;
      const x1 = Number(box.x1) || x0;
      const y0 = Number(box.y0) || 0;
      const y1 = Number(box.y1) || y0;
      return { text: normalizeOcrText(word && word.text), x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, confidence: Number(word && (word.confidence ?? word.conf)) || 0 };
    }).filter((word) => word.text && (word.x1 > word.x0 || word.y1 > word.y0));
  }

  function inferGridCenters(words, data) {
    const width = Number(data && (data.imageWidth || data.width)) || Math.max(1, ...words.map((word) => word.x1));
    const height = Number(data && (data.imageHeight || data.height)) || Math.max(1, ...words.map((word) => word.y1));
    const knownDays = new Map();
    const knownPeriods = new Map();
    const headerCandidates = ocrHeaderCandidates(words);
    headerCandidates.forEach((word) => {
      const day = dayFromOcrText(word.text);
      if (day && !knownDays.has(day)) knownDays.set(day, word.cx);
    });
    const headerYValues = headerCandidates.filter((word) => dayFromOcrText(word.text)).map((word) => word.cy).sort((a, b) => a - b);
    const headerY = headerYValues.length ? headerYValues[Math.floor(headerYValues.length / 2)] : height * 0.12;
    headerCandidates.forEach((word) => {
      const period = periodFromOcrText(word.text);
      // Standalone numbers elsewhere in a screenshot (dates, percentages,
      // version labels) are common false positives. Period labels normally sit
      // in the left 25% gutter and below the weekday header; explicit “第 1 节”
      // text is safe anywhere below that header.
      const explicitPeriod = /(?:节|講|讲|次|时|時)/.test(word.text);
      const belowHeader = word.cy > headerY + Math.max(24, height * 0.025);
      if (period && belowHeader && (explicitPeriod || word.cx <= width * 0.25) && !knownPeriods.has(period)) knownPeriods.set(period, word.cy);
    });
    let dayCenters = Array.from({ length: DAY_NAMES.length }, (_, index) => knownDays.get(index + 1) || null);
    const knownDayValues = Array.from(knownDays.values());
    if (knownDayValues.length >= 2) {
      const sortedKnown = Array.from(knownDays.entries()).sort((a, b) => a[0] - b[0]);
      const gaps = [];
      for (let i = 1; i < sortedKnown.length; i += 1) gaps.push((sortedKnown[i][1] - sortedKnown[i - 1][1]) / (sortedKnown[i][0] - sortedKnown[i - 1][0]));
      const gap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || width / 7;
      const anchor = sortedKnown[0];
      dayCenters = dayCenters.map((center, index) => center || anchor[1] + (index + 1 - anchor[0]) * gap);
    } else {
      // 没有读到“周一”等表头时，按图片主体宽度均分，仍可识别常见 7 列课表。
      const xs = words.map((word) => word.cx).sort((a, b) => a - b);
      const left = xs[Math.floor(xs.length * 0.05)] || 0;
      const right = xs[Math.max(0, Math.ceil(xs.length * 0.95) - 1)] || width;
      const span = Math.max(1, right - left);
      dayCenters = Array.from({ length: DAY_NAMES.length }, (_, index) => left + span * (index + 0.5) / DAY_NAMES.length);
    }
    let periodCenters = Array.from({ length: PERIODS.length }, (_, index) => knownPeriods.get(index + 1) || null);
    const knownPeriodValues = Array.from(knownPeriods.values());
    if (knownPeriodValues.length >= 2) {
      const sortedKnown = Array.from(knownPeriods.entries()).sort((a, b) => a[0] - b[0]);
      const gaps = [];
      for (let i = 1; i < sortedKnown.length; i += 1) gaps.push((sortedKnown[i][1] - sortedKnown[i - 1][1]) / (sortedKnown[i][0] - sortedKnown[i - 1][0]));
      const gap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || height / 5;
      const anchor = sortedKnown[0];
      periodCenters = periodCenters.map((center, index) => center || anchor[1] + (index + 1 - anchor[0]) * gap);
    } else {
      const ys = words.map((word) => word.cy).sort((a, b) => a - b);
      const top = ys[Math.floor(ys.length * 0.2)] || 0;
      const bottom = ys[Math.max(0, Math.ceil(ys.length * 0.95) - 1)] || height;
      const span = Math.max(1, bottom - top);
      periodCenters = Array.from({ length: PERIODS.length }, (_, index) => top + span * (index + 0.5) / PERIODS.length);
    }
    return { dayCenters, periodCenters, width, height };
  }

  function nearestIndex(value, centers) {
    let best = -1;
    let distance = Infinity;
    centers.forEach((center, index) => { const current = Math.abs(value - center); if (current < distance) { distance = current; best = index; } });
    return { index: best, distance };
  }

  function ocrHeaderCandidates(words) {
    // Chinese OCR occasionally separates “周”和“二” into two boxes. Add a
    // small set of adjacent, same-line combinations for header detection only;
    // the original word list remains unchanged for cell parsing.
    const sorted = words.slice().sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
    const candidates = words.slice();
    for (let i = 0; i < sorted.length; i += 1) {
      const first = sorted[i];
      for (let j = i + 1; j < sorted.length && j <= i + 3; j += 1) {
        const second = sorted[j];
        const lineTolerance = Math.max(10, Math.min(first.y1 - first.y0, second.y1 - second.y0) * 0.8);
        const gap = second.x0 - first.x1;
        if (Math.abs(second.cy - first.cy) > lineTolerance || gap < -4 || gap > 55) break;
        candidates.push({
          text: `${first.text}${second.text}`,
          x0: first.x0,
          x1: second.x1,
          y0: Math.min(first.y0, second.y0),
          y1: Math.max(first.y1, second.y1),
          cx: (first.x0 + second.x1) / 2,
          cy: (first.cy + second.cy) / 2
        });
      }
    }
    return candidates;
  }

  function ocrCellText(words) {
    // Tesseract word centres are not perfectly aligned (large Chinese glyphs
    // can be a few pixels higher). Cluster tolerant visual lines, then restore
    // left-to-right order so “高 等 数学” never becomes “等 高 数学”.
    const lines = [];
    words.slice().sort((a, b) => a.cy - b.cy || a.x0 - b.x0).forEach((word) => {
      const height = Math.max(8, word.y1 - word.y0);
      let target = lines.find((line) => Math.abs(line.cy - word.cy) <= Math.max(12, Math.min(line.height, height) * 0.7));
      if (!target) {
        target = { cy: word.cy, height, words: [] };
        lines.push(target);
      }
      target.words.push(word);
      const count = target.words.length;
      target.cy = (target.cy * (count - 1) + word.cy) / count;
      target.height = Math.max(target.height, height);
    });
    return lines.sort((a, b) => a.cy - b.cy)
      .map((line) => line.words.sort((a, b) => a.x0 - b.x0).map((word) => word.text).join(' '))
      .join('\n');
  }

  function parseCourseCell(raw, day, period) {
    let text = normalizeOcrText(raw);
    if (!text || !day || !period) return null;
    // Date numbers immediately below weekday headers may land in the first
    // course cell. Remove a standalone leading 1–31 line, but keep real titles.
    text = text.replace(/^\s*(?:[1-9]|[12]\d|3[01])\s*\n+/, '');
    let compact = compactOcrText(text);
    if (/^(?:无|空|—|-|\+|添加|课程|时间|地点|教师|周[一二三四五六日天])$/.test(compact) || /^[\d\s:：./-]+$/.test(compact)) return null;
    const weekMatch = compact.match(/((?:第)?[0-9零〇一二两三四五六七八九十]+\s*[-~至到–—−－﹣]\s*[0-9零〇一二两三四五六七八九十]+\s*周?|(?:第)?[0-9零〇一二两三四五六七八九十]+\s*周?|单周|双周)/);
    const weeks = weekMatch ? normalizeWeekRule(weekMatch[1]) : '1-16';
    if (weekMatch) compact = compact.replace(weekMatch[0], '');
    let teacher = '';
    const teacherMatch = compact.match(/(?:教师|老师)[:：]?([\u4e00-\u9fa5A-Za-z·]{1,12})/) || compact.match(/([\u4e00-\u9fa5A-Za-z·]{1,10}(?:老师|教授|讲师|教练|博士|先生|女士))/);
    if (teacherMatch) {
      teacher = teacherMatch[1] || teacherMatch[0];
      if (!/(?:老师|教授|讲师|教练|博士|先生|女士)$/.test(teacher) && /(?:老师|教授|讲师|教练|博士|先生|女士)$/.test(teacherMatch[0])) {
        teacher += teacherMatch[0].match(/(?:老师|教授|讲师|教练|博士|先生|女士)$/)[0];
      }
      compact = compact.replace(teacherMatch[0], '');
    }
    let room = '';
    const compactLines = normalizeOcrText(text).split('\n').map(compactOcrText).filter(Boolean);
    const roomMatch = compact.match(/[A-Za-zＡ-Ｚ]{1,4}[-—]?\d{2,4}[A-Za-z]?/i);
    if (roomMatch) room = roomMatch[0];
    if (!room) {
      for (const line of compactLines.slice(1)) {
        const match = line.match(/[\u4e00-\u9fa5]{1,8}(?:楼|室|馆|场|教室)\d{0,4}/);
        if (match) { room = match[0]; break; }
      }
    }
    if (room) compact = compact.replace(room, '');
    // Course names normally occupy the first visual line. This prevents a
    // building name on line two from being glued onto the title.
    let name = compactLines[0] || compact;
    if (weekMatch) name = name.replace(weekMatch[0], '');
    if (teacherMatch) name = name.replace(teacherMatch[0], '');
    if (room) name = name.replace(room, '');
    name = name.replace(/[↳↪→>'"“”‘’·•:：,，;；\-—]/g, '').trim();
    if (/^大学英语[中川Ⅲ3]$/.test(name)) name = '大学英语 III';
    // “课程名（教师）”等 OCR 结果中残留的括号不应成为课程名。
    name = name.replace(/^[：:、,，;；\-—]+|[：:、,，;；\-—]+$/g, '').trim();
    const uiNoise = /(campusflow|大二计划|我的课表|本周|开学前|点击空白|回到本周|添加课程|导出表格|更新中心|截图识别|门课程|学分|工作日课程|搜索任务|设置与备份|今日提醒|\bven\b|\bbi\b)/i;
    const hasCjk = /[\u4e00-\u9fa5]/.test(name);
    const hasLatinWord = /[A-Za-z]{2,}/.test(name);
    if (!name || name.length < 2 || uiNoise.test(name) || uiNoise.test(compactOcrText(name)) || (!hasCjk && !hasLatinWord)) return null;
    return { name, code: '', teacher, room, day, period, duration: 1, weeks, color: COLORS[(day + period) % COLORS.length], credits: 0 };
  }

  function mergeOcrCourse(list, item) {
    if (!item) return;
    const normalizedName = compactOcrText(item.name).toLowerCase();
    const existing = list.find((course) => {
      const teacherMatches = !course.teacher || !item.teacher || compactOcrText(course.teacher) === compactOcrText(item.teacher);
      const roomMatches = !course.room || !item.room || compactOcrText(course.room).toLowerCase() === compactOcrText(item.room).toLowerCase();
      return Number(course.day) === Number(item.day)
        && compactOcrText(course.name).toLowerCase() === normalizedName
        && teacherMatches && roomMatches
        && Math.abs(Number(course.period) - Number(item.period)) <= Math.max(1, Number(course.duration) || 1);
    });
    if (existing) {
      const end = Math.max(Number(existing.period) + Math.max(1, Number(existing.duration) || 1) - 1, Number(item.period));
      existing.duration = clamp(end - Number(existing.period) + 1, 1, 3);
      if (!existing.teacher && item.teacher) existing.teacher = item.teacher;
      if (!existing.room && item.room) existing.room = item.room;
      if (existing.weeks === '1-16' && item.weeks !== '1-16') existing.weeks = item.weeks;
      return;
    }
    list.push(item);
  }

  function parseTimetableOcr(data) {
    const text = normalizeOcrText(data && data.text);
    const words = ocrWordList(data);
    const courses = [];
    if (words.length >= 4) {
      const grid = inferGridCenters(words, data);
      const cells = new Map();
      const columnWidth = Math.max(30, Math.abs(grid.dayCenters[1] - grid.dayCenters[0]) * 0.72);
      const rowHeight = Math.max(25, Math.abs(grid.periodCenters[1] - grid.periodCenters[0]) * 0.72);
      words.forEach((word) => {
        if (dayFromOcrText(word.text) || periodFromOcrText(word.text) || /^\d{1,2}:\d{2}$/.test(word.text)) return;
        const day = nearestIndex(word.cx, grid.dayCenters);
        const period = nearestIndex(word.cy, grid.periodCenters);
        if (day.index < 0 || period.index < 0 || day.distance > columnWidth || period.distance > rowHeight) return;
        const key = `${day.index + 1}:${period.index + 1}`;
        (cells.get(key) || cells.set(key, []).get(key)).push(word);
      });
      cells.forEach((cellWords, key) => {
        const [day, period] = key.split(':').map(Number);
        const cellText = ocrCellText(cellWords);
        mergeOcrCourse(courses, parseCourseCell(cellText, day, period));
      });
    }
    // 若截图没有清晰表格边界，使用带“周一/第 1 节”的行式识别结果兜底。
    if (!courses.length && text) {
      let currentDay = null;
      let currentPeriod = null;
      text.split(/\n+/).map(normalizeOcrText).filter(Boolean).forEach((line) => {
        const day = dayFromOcrText(line);
        const period = periodFromOcrText(line);
        if (day) currentDay = day;
        if (period) currentPeriod = period;
        const stripped = line.replace(/(?:周|星期|礼拜)\s*[一二三四五六日天1-7]/g, '').replace(/(?:第\s*)?[一二三四五六七八九十\d]{1,2}\s*(?:节|讲|次)/g, '').trim();
        if (currentDay && currentPeriod && stripped && stripped.length > 1) mergeOcrCourse(courses, parseCourseCell(stripped, currentDay, currentPeriod));
      });
    }
    // 最后尝试识别“周一 第1节 课程名 教师/教室”同一行的格式。
    if (!courses.length && text) {
      text.split(/\n+/).map(normalizeOcrText).forEach((line) => {
        const day = dayFromOcrText(line);
        const period = periodFromOcrText(line);
        if (day && period) {
          const stripped = line.replace(/(?:周|星期|礼拜)\s*[一二三四五六日天1-7]/g, '').replace(/(?:第\s*)?[一二三四五六七八九十\d]{1,2}\s*(?:节|讲|次)/g, '').trim();
          mergeOcrCourse(courses, parseCourseCell(stripped, day, period));
        }
      });
    }
    return { courses: courses.slice(0, 80), text: text || '（OCR 未返回文字）' };
  }

  function ocrPreviewBody(parsed) {
    const courses = parsed.courses || [];
    if (!courses.length) {
      return `<div class="ocr-empty"><div class="ocr-progress-icon">?</div><h3>暂未识别到课程</h3><p>请使用清晰、完整的课表截图，或先手动添加课程。你也可以查看下方原始文字后重试。</p><details><summary>查看 OCR 原始文字</summary><pre class="ocr-raw-text">${escapeHtml(parsed.text || '')}</pre></details><div class="modal-foot"><button type="button" class="btn btn-primary" data-action="close-modal">关闭</button></div></div>`;
    }
    const rows = courses.map((course, index) => `<div class="ocr-course-row" data-ocr-course>
      <label class="ocr-course-check"><input type="checkbox" checked aria-label="导入${escapeHtml(course.name)}" /><span></span></label>
      <div class="ocr-course-fields"><div class="ocr-course-title"><input data-field="name" required maxlength="60" value="${escapeHtml(course.name)}" aria-label="课程名称" /><span class="tag teal">识别 ${index + 1}</span></div>
      <div class="ocr-course-grid"><label>星期<select data-field="day">${DAY_NAMES.map((name, i) => `<option value="${i + 1}" ${Number(course.day) === i + 1 ? 'selected' : ''}>周${name}</option>`).join('')}</select></label><label>节次<select data-field="period">${PERIODS.map((period) => `<option value="${period.id}" ${Number(course.period) === period.id ? 'selected' : ''}>第 ${period.id} 节</option>`).join('')}</select></label><label>连上<input data-field="duration" type="number" min="1" max="3" value="${clamp(Number(course.duration) || 1, 1, 3)}" /></label><label>周次<input data-field="weeks" value="${escapeHtml(course.weeks || '1-16')}" placeholder="1-16 / 单周" /></label></div>
      <div class="ocr-course-grid"><label>教室<input data-field="room" maxlength="30" value="${escapeHtml(course.room || '')}" placeholder="教室 / 地点" /></label><label>教师<input data-field="teacher" maxlength="30" value="${escapeHtml(course.teacher || '')}" placeholder="教师" /></label><label>颜色<select data-field="color">${COLORS.map((color) => `<option value="${color}" ${(course.color || 'teal') === color ? 'selected' : ''}>${{ teal: '青绿', orange: '橙色', purple: '紫色', blue: '蓝色' }[color]}</option>`).join('')}</select></label></div></div></div>`).join('');
    return `<form data-form="ocr-courses"><div class="ocr-preview-summary"><strong>识别到 ${courses.length} 门课程</strong><span>请核对并编辑后再导入；已有课程不会被覆盖。</span></div><div class="ocr-course-list">${rows}</div><details class="ocr-raw"><summary>查看 OCR 原始文字</summary><pre class="ocr-raw-text">${escapeHtml(parsed.text || '')}</pre></details><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button><button class="btn btn-primary" type="submit">导入选中课程</button></div></form>`;
  }

  function importTimetableImage(file) {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) { showToast('请选择图片格式的课表截图', 'error'); return; }
    const runId = ++ocrRunId;
    openModal('截图识别课表', '图片只在本机处理，不会上传。识别后可逐条核对。', ocrProgressBody(), { context: `ocr-progress-${runId}` });
    (async () => {
      try {
        updateOcrProgress('正在准备中文识别模型…', 0.05);
        const data = await recognizeTimetableImage(file);
        const parsed = parseTimetableOcr(data);
        if (runId !== ocrRunId || $('#modal-backdrop')?.hidden) return;
        openModal('识别结果预览', '请核对课程名称、星期和节次；确认后只会追加新课程。', ocrPreviewBody(parsed), { context: `ocr-result-${runId}`, preserveReturnFocus: true });
      } catch (error) {
        if (runId !== ocrRunId || $('#modal-backdrop')?.hidden) return;
        openModal('截图识别失败', '未能完成本次识别，现有课表没有任何变化。', `<div class="ocr-empty"><div class="ocr-progress-icon">!</div><h3>需要重试</h3><p>${escapeHtml(error && error.message ? error.message : 'OCR 引擎暂时不可用')}</p><p class="form-hint">请检查网络后重试，或手动添加课程。Tesseract.js 首次使用需要下载中文模型。</p><div class="modal-foot"><button type="button" class="btn btn-primary" data-action="close-modal">知道了</button></div></div>`, { context: `ocr-error-${runId}`, preserveReturnFocus: true });
      }
    })();
  }

  function getStreak(habit) {
    let streak = 0;
    let cursor = new Date();
    // Before today's check-in, keep showing the active streak that ended
    // yesterday instead of dropping a motivating 20-day streak to zero.
    if (!(habit.logs && habit.logs[dateKey(cursor)])) cursor = addDays(cursor, -1);
    while (habit.logs && habit.logs[dateKey(cursor)]) { streak += 1; cursor = addDays(cursor, -1); if (streak > 365) break; }
    return streak;
  }

  function getMaxStreak() {
    return state.habits.reduce((max, habit) => Math.max(max, getHistoricalMaxStreak(habit)), 0);
  }

  function getHistoricalMaxStreak(habit) {
    const dates = Object.keys(habit.logs || {}).filter((key) => habit.logs[key]).sort();
    let best = 0;
    let run = 0;
    let previous = null;
    dates.forEach((key) => {
      const gap = previous ? Math.round((dateFromKey(key) - dateFromKey(previous)) / 86400000) : 0;
      run = gap === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      previous = key;
    });
    return best;
  }

  function getFocusSnapshot() {
    const focus = state.focus;
    if (focus.running && focus.endsAt) {
      const remaining = Math.max(0, Math.ceil((Number(focus.endsAt) - Date.now()) / 1000));
      if (remaining === 0) {
        completeFocusSession();
        return { ...state.focus, remaining: state.focus.duration, running: false };
      }
      return { ...focus, remaining };
    }
    return focus;
  }

  function completeFocusSession() {
    const selected = state.tasks.find((task) => task.id === state.focus.selectedTask);
    const completedMinutes = Math.round((state.focus.duration || 1500) / 60);
    if (selected) selected.focusMinutes = (selected.focusMinutes || 0) + completedMinutes;
    state.focus.sessions = (state.focus.sessions || 0) + 1;
    state.focus.totalMinutes = (Number(state.focus.totalMinutes) || 0) + completedMinutes;
    state.focus.running = false;
    state.focus.endsAt = null;
    state.focus.remaining = state.focus.duration || 1500;
    if (focusTick) { clearInterval(focusTick); focusTick = null; }
    saveState();
    showToast('完成一轮专注，太棒了！', 'success');
    if (state.settings.notifications === true) showDeviceNotification('CampusFlow · 专注完成', {
      body: selected ? `${selected.title}：完成了 ${completedMinutes} 分钟专注。当前下一步：${taskNextStep(selected)}` : `完成了 ${completedMinutes} 分钟专注，起来活动一下吧。`,
      tag: `campusflow-focus-${Date.now()}`,
      data: { view: 'focus' }
    });
  }

  function tickFocus() {
    const snapshot = getFocusSnapshot();
    if (currentView !== 'focus') return;
    const time = $('#focus-time');
    if (time) time.textContent = `${pad(Math.floor(snapshot.remaining / 60))}:${pad(snapshot.remaining % 60)}`;
    const label = $('.focus-orbit > span');
    if (label) label.textContent = snapshot.running ? '正在专注' : '准备好了吗？';
  }

  function openModal(title, subtitle, body, options) {
    const backdrop = $('#modal-backdrop');
    const modal = $('#modal');
    if (!backdrop || !modal) return;
    if (!(options && options.preserveReturnFocus)) {
      const active = document.activeElement;
      modalReturnFocus = active && active !== document.body ? active : null;
    }
    modal.innerHTML = `<div class="modal-head"><div><h2 id="modal-title">${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="icon-btn" data-action="close-modal" aria-label="关闭">×</button></div>${body}`;
    backdrop.hidden = false;
    const first = $('form input:not([type="hidden"]), form select, form textarea, form button[type="submit"]', modal)
      || $('[data-action="close-modal"]', modal);
    if (first) window.setTimeout(() => first.focus(), 20);
    modal.dataset.context = options && options.context ? options.context : '';
  }
  function closeModal() {
    const backdrop = $('#modal-backdrop');
    if (!backdrop || backdrop.hidden) return;
    const modal = $('#modal');
    // Ignore a late OCR result after the user cancelled or started another run.
    if (modal && String(modal.dataset.context || '').startsWith('ocr-')) {
      ocrRunId += 1;
      if (activeOcrWorker?.terminate) Promise.resolve(activeOcrWorker.terminate()).catch(() => {});
      activeOcrWorker = null;
    }
    backdrop.hidden = true;
    const returnFocus = modalReturnFocus;
    modalReturnFocus = null;
    if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
  }

  function taskForm(task) {
    const editing = Boolean(task);
    const stepText = taskSteps(task).map((step) => step.text).join('\n') || task?.nextStep || task?.desc || '';
    return `<form data-form="task" data-id="${editing ? task.id : ''}"><div class="form-grid"><div class="form-field full"><label for="task-title">任务标题 *</label><input id="task-title" name="title" required maxlength="80" value="${escapeHtml(task?.title || '')}" placeholder="例如：完成数据结构第三章习题" /></div><div class="form-field full"><label for="task-steps">行动步骤（每行一步） *</label><textarea id="task-steps" name="steps" required maxlength="800" placeholder="打开课本并找到第三章&#10;完成第 1–5 题&#10;对照答案订正错题">${escapeHtml(stepText)}</textarea><small class="form-hint">提醒只展示当前一步；点击“完成此步”后会自动推进，最后一步完成时整项任务完成。</small></div><div class="form-field full"><label for="task-desc">补充备注（可选）</label><textarea id="task-desc" name="desc" maxlength="500" placeholder="需要的资料、完成标准或其他说明">${escapeHtml(task?.desc || '')}</textarea></div><div class="form-field"><label for="task-due">截止日期</label><input id="task-due" name="due" type="date" value="${task?.due || todayKey()}" /></div><div class="form-field"><label for="task-time">截止时间</label><input id="task-time" name="time" type="time" value="${task?.time || ''}" /></div><div class="form-field"><label for="task-priority">优先级</label><select id="task-priority" name="priority"><option value="low" ${task?.priority === 'low' ? 'selected' : ''}>低</option><option value="medium" ${task?.priority === 'medium' ? 'selected' : ''}>中</option><option value="high" ${task?.priority === 'high' ? 'selected' : ''}>高</option></select></div><div class="form-field"><label for="task-category">分类</label><select id="task-category" name="category"><option ${!task?.category ? 'selected' : ''}>课程</option><option ${task?.category === '成长' ? 'selected' : ''}>成长</option><option ${task?.category === '社团' ? 'selected' : ''}>社团</option><option ${task?.category === '生活' ? 'selected' : ''}>生活</option><option ${task?.category === '其他' ? 'selected' : ''}>其他</option></select></div><div class="form-field"><label for="task-estimate">预计时长（分钟）</label><input id="task-estimate" name="estimate" type="number" min="5" max="999" step="5" value="${task?.estimate || 30}" /></div></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button><button class="btn btn-primary" type="submit">${editing ? '保存修改' : '添加任务'}</button></div></form>`;
  }

  function courseForm(course, preset) {
    const item = course || {};
    return `<form data-form="course" data-id="${item.id || ''}"><div class="form-grid"><div class="form-field full"><label for="course-name">课程名称 *</label><input id="course-name" name="name" required maxlength="60" value="${escapeHtml(item.name || '')}" placeholder="例如：高等数学" /></div><div class="form-field"><label for="course-code">课程代码</label><input id="course-code" name="code" maxlength="20" value="${escapeHtml(item.code || '')}" placeholder="MATH201" /></div><div class="form-field"><label for="course-teacher">教师</label><input id="course-teacher" name="teacher" maxlength="30" value="${escapeHtml(item.teacher || '')}" placeholder="李老师" /></div><div class="form-field"><label for="course-room">教室 / 地点</label><input id="course-room" name="room" maxlength="30" value="${escapeHtml(item.room || '')}" placeholder="A-302" /></div><div class="form-field"><label for="course-day">星期</label><select id="course-day" name="day">${DAY_NAMES.map((name, i) => `<option value="${i + 1}" ${(Number(item.day || preset?.day || 1) === i + 1) ? 'selected' : ''}>周${name}</option>`).join('')}</select></div><div class="form-field"><label for="course-period">节次</label><select id="course-period" name="period">${PERIODS.map((period) => `<option value="${period.id}" ${(Number(item.period || preset?.period || 1) === period.id) ? 'selected' : ''}>${period.label} · ${period.time}</option>`).join('')}</select></div><div class="form-field"><label for="course-duration">连上节数</label><input id="course-duration" name="duration" type="number" min="1" max="3" value="${item.duration || 1}" /></div><div class="form-field"><label for="course-weeks">上课周次</label><input id="course-weeks" name="weeks" value="${escapeHtml(item.weeks || '1-16')}" placeholder="1-16 / 单周" /></div><div class="form-field"><label for="course-color">颜色</label><select id="course-color" name="color">${COLORS.map((color) => `<option value="${color}" ${(item.color || 'teal') === color ? 'selected' : ''}>${{ teal: '青绿色', orange: '橙色', purple: '紫色', blue: '蓝色' }[color]}</option>`).join('')}</select></div><div class="form-field"><label for="course-credits">学分</label><input id="course-credits" name="credits" type="number" min="0" max="20" step="0.5" value="${item.credits || 2}" /></div></div><p class="form-hint">同一天同一节已有课程时会提醒冲突，但仍允许保存，方便记录调课。</p><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button>${item.id ? '<button type="button" class="btn btn-danger" data-action="delete-course" data-id="' + item.id + '">删除课程</button>' : ''}<button class="btn btn-primary" type="submit">${item.id ? '保存修改' : '添加课程'}</button></div></form>`;
  }

  function habitForm(habit) {
    return `<form data-form="habit" data-id="${habit?.id || ''}"><div class="form-grid"><div class="form-field full"><label for="habit-name">习惯名称 *</label><input id="habit-name" name="name" required maxlength="50" value="${escapeHtml(habit?.name || '')}" placeholder="例如：晚间复盘 10 分钟" /></div><div class="form-field"><label for="habit-emoji">图标</label><input id="habit-emoji" name="emoji" maxlength="4" value="${escapeHtml(habit?.emoji || '✦')}" /></div><div class="form-field"><label for="habit-target">目标</label><input id="habit-target" name="target" maxlength="30" value="${escapeHtml(habit?.target || '每天 1 次')}" placeholder="每天 1 次" /></div></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button>${habit?.id ? '<button type="button" class="btn btn-danger" data-action="delete-habit" data-id="' + habit.id + '">归档</button>' : ''}<button class="btn btn-primary" type="submit">${habit?.id ? '保存修改' : '添加习惯'}</button></div></form>`;
  }

  function eventForm(event) {
    const eventTypes = ['考试', '截止', '社团', '个人', '调课'];
    return `<form data-form="event" data-id="${event?.id || ''}"><div class="form-grid"><div class="form-field full"><label for="event-title">事件标题 *</label><input id="event-title" name="title" required maxlength="80" value="${escapeHtml(event?.title || '')}" placeholder="例如：期中考试 / 社团活动" /></div><div class="form-field"><label for="event-date">日期 *</label><input id="event-date" name="date" type="date" required value="${event?.date || todayKey()}" /></div><div class="form-field"><label for="event-time">开始时间</label><input id="event-time" name="time" type="time" value="${event?.time || ''}" /></div><div class="form-field"><label for="event-end">结束时间</label><input id="event-end" name="endTime" type="time" value="${event?.endTime || ''}" /></div><div class="form-field"><label for="event-type">类型</label><select id="event-type" name="type">${eventTypes.map((type) => `<option ${event?.type === type ? 'selected' : ''}>${type}</option>`).join('')}</select></div><div class="form-field full"><label for="event-place">地点</label><input id="event-place" name="place" maxlength="60" value="${escapeHtml(event?.place || '')}" placeholder="地点或线上链接" /></div><div class="form-field full"><label for="event-note">备注</label><textarea id="event-note" name="note" maxlength="300" placeholder="补充说明">${escapeHtml(event?.note || '')}</textarea></div></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button>${event?.id ? '<button type="button" class="btn btn-danger" data-action="delete-event" data-id="' + event.id + '">删除</button>' : ''}<button class="btn btn-primary" type="submit">${event?.id ? '保存修改' : '添加事件'}</button></div></form>`;
  }

  function noteForm(note) {
    return `<form data-form="note" data-id="${note?.id || ''}"><div class="form-grid"><div class="form-field full"><label for="note-title">标题 *</label><input id="note-title" name="title" required maxlength="80" value="${escapeHtml(note?.title || '')}" placeholder="给这条想法一个标题" /></div><div class="form-field full"><label for="note-content">内容</label><textarea id="note-content" name="content" maxlength="3000" placeholder="课程灵感、项目草图、想对未来说的话……">${escapeHtml(note?.content || '')}</textarea></div><label class="setting-control form-field full"><span>置顶这条笔记</span><input type="checkbox" name="pinned" ${note?.pinned ? 'checked' : ''} /><i></i></label></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button>${note?.id ? '<button type="button" class="btn btn-danger" data-action="delete-note" data-id="' + note.id + '">删除</button>' : ''}<button class="btn btn-primary" type="submit">${note?.id ? '保存笔记' : '保存笔记'}</button></div></form>`;
  }

  function goalForm(goal) {
    return `<form data-form="goal" data-id="${goal?.id || ''}"><div class="form-grid"><div class="form-field full"><label for="goal-title">目标 *</label><input id="goal-title" name="title" required maxlength="80" value="${escapeHtml(goal?.title || '')}" placeholder="例如：完成一个作品集项目" /></div><div class="form-field full"><label for="goal-target">衡量方式</label><input id="goal-target" name="target" maxlength="100" value="${escapeHtml(goal?.target || '')}" placeholder="如何判断自己完成了？" /></div><div class="form-field"><label for="goal-progress">当前进度（%）</label><input id="goal-progress" name="progress" type="number" min="0" max="100" value="${goal?.progress || 0}" /></div><div class="form-field"><label for="goal-due">截止日期</label><input id="goal-due" name="due" type="date" value="${goal?.due || ''}" /></div></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button>${goal?.id ? '<button type="button" class="btn btn-danger" data-action="delete-goal" data-id="' + goal.id + '">删除</button>' : ''}<button class="btn btn-primary" type="submit">保存目标</button></div></form>`;
  }

  function profileForm() {
    return `<form data-form="profile"><div class="form-grid"><div class="form-field"><label for="profile-name">称呼</label><input id="profile-name" name="name" required maxlength="30" value="${escapeHtml(state.profile.name || '')}" /></div><div class="form-field"><label for="profile-major">专业 / 方向</label><input id="profile-major" name="major" maxlength="50" value="${escapeHtml(state.profile.major || '')}" /></div></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button><button class="btn btn-primary" type="submit">保存资料</button></div></form>`;
  }

  function semesterForm() {
    return `<form data-form="semester"><div class="form-grid"><div class="form-field"><label for="semester-term">学期名称</label><input id="semester-term" name="term" required maxlength="30" value="${escapeHtml(state.profile.term || '大二上学期')}" /></div><div class="form-field"><label for="semester-year">学年</label><input id="semester-year" name="academicYear" value="${escapeHtml(state.profile.academicYear || '')}" /></div><div class="form-field"><label for="semester-start">开学日期</label><input id="semester-start" name="startDate" type="date" value="${state.profile.startDate || todayKey()}" /></div><div class="form-field"><label for="semester-weeks">总周数</label><input id="semester-weeks" name="totalWeeks" type="number" min="1" max="40" value="${state.profile.totalWeeks || 20}" /></div></div><p class="form-hint">修改学期信息不会删除已有课程和任务。</p><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button><button class="btn btn-primary" type="submit">保存学期</button></div></form>`;
  }

  function dailyLogForm() {
    return `<form data-form="daily"><div class="form-grid"><div class="form-field"><label for="daily-water">饮水（杯）</label><input id="daily-water" name="water" type="number" min="0" max="40" value="${state.daily.water || 0}" /></div><div class="form-field"><label for="daily-water-goal">饮水目标</label><input id="daily-water-goal" name="waterGoal" type="number" min="1" max="40" value="${state.daily.waterGoal || 8}" /></div><div class="form-field"><label for="daily-mood">心情</label><select id="daily-mood" name="mood">${['开心', '平静', '专注', '疲惫', '低落'].map((m) => `<option ${state.daily.mood === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div><div class="form-field"><label for="daily-sleep">睡眠</label><input id="daily-sleep" name="sleep" maxlength="20" value="${escapeHtml(state.daily.sleep || '')}" placeholder="7h 30m" /></div><div class="form-field full"><label for="daily-journal">一句话记录</label><textarea id="daily-journal" name="journal" maxlength="500" placeholder="今天最值得记住的事……">${escapeHtml(state.daily.journal || '')}</textarea></div></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button><button class="btn btn-primary" type="submit">保存记录</button></div></form>`;
  }

  function updatesModal() {
    const logs = mergeChangelog(state.changelog);
    return `<div class="updates-modal"><div class="update-hero"><span class="update-badge">CURRENT</span><strong>CampusFlow ${APP_VERSION}</strong><span>你的大二计划工作台</span></div><div class="update-list">${logs.map((item) => `<div class="update-item"><div><strong>${escapeHtml(item.version)}</strong><span>${escapeHtml(item.date)}</span></div><p>${escapeHtml(item.text)}</p></div>`).join('')}</div><div class="modal-foot"><button type="button" class="btn btn-primary" data-action="close-modal">知道了</button></div></div>`;
  }

  function handleClick(event) {
    const viewTarget = event.target.closest('[data-view]');
    // Sidebar buttons use data-view directly; in-content links additionally use go-view.
    if (viewTarget && !viewTarget.dataset.action) return setView(viewTarget.dataset.view);
    const target = event.target.closest('[data-action]');
    if (!target) {
      if (event.target === $('#modal-backdrop')) closeModal();
      return;
    }
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (action === 'go-view') return setView(target.dataset.view);
    if (action === 'focus-search') { $('#global-search')?.focus(); return; }
    if (action === 'toggle-sidebar') return setSidebarOpen(!$('#sidebar')?.classList.contains('open'));
    if (action === 'close-sidebar') return setSidebarOpen(false, { returnFocus: true });
    if (action === 'toggle-theme') { state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark'; saveState(); render(); return; }
    if (action === 'request-notification') { requestBrowserNotification(); return; }
    if (action === 'test-notification') { sendTestNotification(); return; }
    if (action === 'go-today') { currentWeek = startOfWeek(new Date()); calendarCursor = new Date(); setView('dashboard'); return; }
    if (action === 'new-task') { openModal('新建任务', '把下一步写清楚，开始就会变得容易。', taskForm()); return; }
    if (action === 'edit-task') { const task = state.tasks.find((item) => item.id === id); if (task) openModal('编辑任务', '修改后会立即同步到总览与日历。', taskForm(task)); return; }
    if (action === 'start-task-focus') {
      const task = state.tasks.find((item) => item.id === id);
      if (task) {
        state.focus.selectedTask = task.id;
        saveState();
        setView('focus');
        showToast(`已带入任务，当前要做：${taskNextStep(task)}`, 'success', 5200);
      }
      return;
    }
    if (action === 'toggle-task') {
      const task = state.tasks.find((item) => item.id === id);
      if (task) {
        const restoring = task.status === 'done';
        task.status = restoring ? 'todo' : 'done';
        const steps = taskSteps(task);
        if (restoring && steps.length && steps.every((step) => step.done)) steps[steps.length - 1].done = false;
        if (!restoring) steps.forEach((step) => { step.done = true; });
        task.nextStep = taskNextStep(task);
        saveState(); render(); showToast(task.status === 'done' ? '整项任务已完成，做得好！' : `已恢复，下一步：${taskNextStep(task)}`);
      }
      return;
    }
    if (action === 'advance-task') {
      const task = state.tasks.find((item) => item.id === id);
      if (task) {
        const current = taskSteps(task).find((step) => !step.done);
        if (!current) return showToast('这项任务的步骤都已完成');
        current.done = true;
        const next = taskSteps(task).find((step) => !step.done);
        if (next) {
          task.nextStep = next.text;
          showToast(`本步完成，下一步：${next.text}`, 'success', 5200);
        } else {
          task.status = 'done';
          task.nextStep = current.text;
          showToast('最后一步完成，整项任务已完成！', 'success');
        }
        saveState(); render();
        if (next) checkReminders({ source: 'step', forceBrowser: true, taskId: task.id, skipInApp: true });
      }
      return;
    }
    if (action === 'delete-task') { if (window.confirm('确定删除这项任务吗？删除后仍可通过 JSON 备份恢复。')) { state.tasks = state.tasks.filter((item) => item.id !== id); saveState(); render(); showToast('任务已删除'); } return; }
    if (action === 'planner-filter') { plannerFilter = target.dataset.filter || 'all'; render(); return; }
    if (action === 'ocr-import') { $('#ocr-file')?.click(); return; }
    if (action === 'new-course') { openModal('添加课程', '固定课程会显示在每周课表中，可随时修改。', courseForm(null, { day: target.dataset.day, period: target.dataset.period })); return; }
    if (action === 'edit-course') { const course = state.courses.find((item) => item.id === id); if (course) openModal('编辑课程', '修改后会保留在本地课表中。', courseForm(course)); return; }
    if (action === 'delete-course') { if (window.confirm('确定删除这门课程吗？')) { state.courses = state.courses.filter((item) => item.id !== id); saveState(); closeModal(); render(); showToast('课程已删除'); } return; }
    if (action === 'week-prev') { currentWeek = addDays(currentWeek, -7); render(); return; }
    if (action === 'week-next') { currentWeek = addDays(currentWeek, 7); render(); return; }
    if (action === 'go-current-week') { currentWeek = startOfWeek(new Date()); mobileTimetableDay = (new Date().getDay() || 7) - 1; render(); return; }
    if (action === 'timetable-day') { mobileTimetableDay = clamp(Number(target.dataset.dayIndex) || 0, 0, DAY_NAMES.length - 1); render(); return; }
    if (action === 'new-habit') { openModal('添加习惯', '从一个小而确定的动作开始。', habitForm()); return; }
    if (action === 'edit-habit') { const habit = state.habits.find((item) => item.id === id); if (habit) openModal('编辑习惯', '可以随时调整目标，不需要完美。', habitForm(habit)); return; }
    if (action === 'delete-habit') { if (window.confirm('归档这个习惯？历史打卡会保留。')) { state.habits = state.habits.filter((item) => item.id !== id); saveState(); closeModal(); render(); showToast('习惯已归档'); } return; }
    if (action === 'toggle-habit') { const habit = state.habits.find((item) => item.id === id); if (habit) { habit.logs ||= {}; habit.logs[todayKey()] = !habit.logs[todayKey()]; saveState(); render(); showToast(habit.logs[todayKey()] ? '打卡成功，连续记录 +1' : '已取消今天打卡'); } return; }
    if (action === 'new-note') { openModal('新建笔记', '先记下来，再慢慢整理。', noteForm()); return; }
    if (action === 'edit-note') { const note = state.notes.find((item) => item.id === id); if (note) openModal('编辑笔记', '你的想法值得被好好保存。', noteForm(note)); return; }
    if (action === 'select-note') {
      const restoreFocus = document.activeElement === target;
      selectedNoteId = id;
      render();
      if (restoreFocus) window.requestAnimationFrame(() => $$('[data-action="select-note"]').find((item) => item.dataset.id === id)?.focus());
      return;
    }
    if (action === 'delete-note') { if (window.confirm('确定删除这条笔记吗？')) { state.notes = state.notes.filter((item) => item.id !== id); selectedNoteId = state.notes[0]?.id || null; saveState(); closeModal(); render(); showToast('笔记已删除'); } return; }
    if (action === 'new-event') { openModal('新建日历事件', '把重要日期放进视线里。', eventForm()); return; }
    if (action === 'edit-event') { const item = state.events.find((e) => e.id === id); if (item) openModal('编辑日历事件', '修改后会同步到日历视图。', eventForm(item)); return; }
    if (action === 'delete-event') { if (window.confirm('确定删除这个事件吗？')) { state.events = state.events.filter((e) => e.id !== id); saveState(); closeModal(); render(); showToast('事件已删除'); } return; }
    if (action === 'calendar-day' || action === 'select-day') { const key = target.dataset.date; if (key) { calendarCursor = dateFromKey(key); if (action === 'calendar-day') { const item = target.dataset.eventId ? state.events.find((e) => e.id === target.dataset.eventId && !e.autoGenerated) : state.events.find((e) => e.date === key && !e.autoGenerated); if (item) openModal('编辑日历事件', '修改后会同步到日历视图。', eventForm(item)); else openModal('新建日历事件', formatDate(key), eventForm({ date: key })); } else { setView('calendar'); } } return; }
    if (action === 'month-prev') { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); render(); return; }
    if (action === 'month-next') { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); render(); return; }
    if (action === 'calendar-today') { calendarCursor = new Date(); render(); return; }
    if (action === 'go-focus') { setView('focus'); return; }
    if (action === 'focus-toggle') { toggleFocus(); return; }
    if (action === 'focus-reset') {
      state.focus.running = false;
      state.focus.endsAt = null;
      state.focus.remaining = state.focus.duration || 1500;
      if (focusTick) { clearInterval(focusTick); focusTick = null; }
      saveState(); render();
      return;
    }
    if (action === 'focus-task') return;
    if (action === 'focus-settings') { openModal('专注时长', '选择适合当前状态的节奏。', `<form data-form="focus-settings"><div class="form-grid"><div class="form-field full"><label for="focus-minutes">专注分钟数</label><input id="focus-minutes" name="minutes" type="number" min="5" max="180" value="${Math.round((state.focus.duration || 1500) / 60)}" /></div></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button><button class="btn btn-primary" type="submit">保存时长</button></div></form>`); return; }
    if (action === 'new-goal') { openModal('添加学期目标', '目标不必宏大，但要能指导下一步。', goalForm()); return; }
    if (action === 'edit-goal') { const goal = state.goals.find((g) => g.id === id); if (goal) openModal('编辑学期目标', '', goalForm(goal)); return; }
    if (action === 'delete-goal') { if (window.confirm('确定删除这个目标吗？')) { state.goals = state.goals.filter((g) => g.id !== id); saveState(); closeModal(); render(); showToast('目标已删除'); } return; }
    if (action === 'daily-log') { openModal('今日记录', '记录身体与情绪状态，明天会更了解自己。', dailyLogForm()); return; }
    if (action === 'weekly-review') { openModal('本周复盘', '完成、阻塞、下周承诺，写三行就够了。', `<form data-form="weekly-review"><div class="form-field"><label for="review-content">复盘内容</label><textarea id="review-content" name="content" placeholder="这周完成了……\n卡住的地方是……\n下周我会……" style="min-height:180px"></textarea></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button><button class="btn btn-primary" type="submit">保存复盘</button></div></form>`); return; }
    if (action === 'edit-profile') { openModal('个人资料', '让首页的问候更像你。', profileForm()); return; }
    if (action === 'edit-semester') { openModal('学期设置', '修改学期信息不会删除已有数据。', semesterForm()); return; }
    if (action === 'save-settings') { saveState(); showToast('设置已保存', 'success'); return; }
    if (action === 'export-json') { exportJson(); return; }
    if (action === 'import-json') { $('#import-file')?.click(); return; }
    if (action === 'export-csv') { exportCsv(); return; }
    if (action === 'open-updates' || action === 'check-update') { openModal('更新中心', '每次更新都先保留你的本地数据。', updatesModal()); if (action === 'check-update') showToast('已检查：当前是最新版本', 'success'); return; }
    if (action === 'close-modal') { closeModal(); return; }
  }

  function toggleFocus() {
    const focus = state.focus;
    if (focus.running) {
      const snapshot = getFocusSnapshot();
      focus.remaining = snapshot.remaining;
      focus.running = false;
      focus.endsAt = null;
      saveState();
      if (focusTick) { clearInterval(focusTick); focusTick = null; }
      render();
      showToast('专注已暂停');
    } else {
      focus.running = true;
      focus.endsAt = Date.now() + (Number(focus.remaining) || Number(focus.duration) || 1500) * 1000;
      saveState();
      if (!focusTick) focusTick = setInterval(tickFocus, 1000);
      render();
      showToast('专注开始，手机放远一点吧', 'success');
    }
  }

  function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
  function handleSubmit(event) {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const type = form.dataset.form;
    const data = formData(form);
    if (type === 'task') {
      if (!data.title.trim()) return showToast('请填写任务标题', 'error');
      const stepLines = String(data.steps || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (!stepLines.length) return showToast('请至少写下一个行动步骤', 'error');
      const item = form.dataset.id ? state.tasks.find((task) => task.id === form.dataset.id) : { id: uid('task'), status: 'todo' };
      const previousSteps = taskSteps(item);
      const usedPreviousIndexes = new Set();
      const usedStepIds = new Set();
      const steps = stepLines.map((text, index) => {
        const normalized = compactOcrText(text).toLowerCase();
        const indexed = previousSteps[index];
        let previousIndex = indexed && !usedPreviousIndexes.has(index) && compactOcrText(indexed.text).toLowerCase() === normalized ? index : -1;
        if (previousIndex < 0) previousIndex = previousSteps.findIndex((step, stepIndex) => !usedPreviousIndexes.has(stepIndex) && compactOcrText(step.text).toLowerCase() === normalized);
        if (previousIndex >= 0) usedPreviousIndexes.add(previousIndex);
        const previous = previousIndex >= 0 ? previousSteps[previousIndex] : null;
        let stepId = previous?.id || uid('step');
        if (usedStepIds.has(stepId)) stepId = uid('step');
        usedStepIds.add(stepId);
        return { id: stepId, text, done: Boolean(previous?.done) };
      });
      Object.assign(item, { title: data.title.trim(), status: steps.every((step) => step.done) ? 'done' : 'todo', nextStep: steps.find((step) => !step.done)?.text || '所有步骤已完成', steps, desc: data.desc.trim(), due: data.due, time: data.time, priority: data.priority, category: data.category, estimate: Number(data.estimate) || 30 });
      const normalizedItem = normalizeTask(item, state.tasks.indexOf(item));
      if (form.dataset.id) Object.assign(item, normalizedItem);
      else state.tasks.unshift(normalizedItem);
      saveState(); closeModal(); render(); showToast(form.dataset.id ? '任务已更新' : '任务已添加', 'success');
    } else if (type === 'course') {
      if (!data.name.trim()) return showToast('请填写课程名称', 'error');
      const day = clamp(Math.round(Number(data.day) || 1), 1, DAY_NAMES.length);
      const period = clamp(Math.round(Number(data.period) || 1), 1, PERIODS.length);
      const candidate = { day, period, duration: clamp(Math.round(Number(data.duration) || 1), 1, Math.min(3, PERIODS.length - period + 1)), weeks: normalizeWeekRule(data.weeks.trim()) };
      const duplicate = state.courses.find((course) => course.id !== form.dataset.id && coursesOverlap(course, candidate));
      if (duplicate) showToast(`提醒：与「${duplicate.name}」时段重叠`, 'error');
      const item = form.dataset.id ? state.courses.find((course) => course.id === form.dataset.id) : { id: uid('course') };
      Object.assign(item, { name: data.name.trim(), code: data.code.trim(), teacher: data.teacher.trim(), room: data.room.trim(), day: candidate.day, period: candidate.period, duration: candidate.duration, weeks: candidate.weeks, color: COLORS.includes(data.color) ? data.color : 'teal', credits: clamp(Number(data.credits) || 0, 0, 20) });
      if (!form.dataset.id) state.courses.push(item);
      saveState(); closeModal(); render(); showToast(form.dataset.id ? '课程已更新' : '课程已添加', 'success');
    } else if (type === 'ocr-courses') {
      const rows = $$('[data-ocr-course]', form);
      const incoming = rows.filter((row) => $('input[type="checkbox"]', row)?.checked).map((row) => {
        const read = (field) => $(
          `[data-field="${field}"]`, row
        )?.value?.trim() || '';
        const name = read('name');
        const day = clamp(Math.round(Number(read('day')) || 1), 1, DAY_NAMES.length);
        const period = clamp(Math.round(Number(read('period')) || 1), 1, PERIODS.length);
        return { id: uid('course'), name, code: '', teacher: read('teacher'), room: read('room'), day, period, duration: clamp(Math.round(Number(read('duration')) || 1), 1, Math.min(3, PERIODS.length - period + 1)), weeks: normalizeWeekRule(read('weeks') || '1-16'), color: COLORS.includes(read('color')) ? read('color') : 'teal', credits: 0 };
      }).filter((course) => course.name);
      if (!incoming.length) return showToast('请至少勾选一门有效课程', 'error');
      let added = 0;
      let skipped = 0;
      let conflicts = 0;
      incoming.forEach((course) => {
        const duplicate = state.courses.find((existing) => Number(existing.day) === course.day && Number(existing.period) === course.period && compactOcrText(existing.name).toLowerCase() === compactOcrText(course.name).toLowerCase());
        if (duplicate) { skipped += 1; return; }
        if (state.courses.some((existing) => coursesOverlap(existing, course))) conflicts += 1;
        state.courses.push(course);
        added += 1;
      });
      saveState(); closeModal(); render();
      const suffix = skipped ? `，跳过重复 ${skipped} 门` : '';
      showToast(`已追加 ${added} 门课程${suffix}${conflicts ? `；${conflicts} 门存在时段冲突` : ''}`, conflicts ? 'error' : 'success');
    } else if (type === 'habit') {
      if (!data.name.trim()) return showToast('请填写习惯名称', 'error');
      const item = form.dataset.id ? state.habits.find((habit) => habit.id === form.dataset.id) : { id: uid('habit'), logs: {} };
      Object.assign(item, { name: data.name.trim(), emoji: data.emoji || '✦', target: data.target.trim() || '每天 1 次' });
      if (!form.dataset.id) state.habits.push(item);
      saveState(); closeModal(); render(); showToast(form.dataset.id ? '习惯已更新' : '习惯已添加', 'success');
    } else if (type === 'note') {
      if (!data.title.trim()) return showToast('请填写笔记标题', 'error');
      const item = form.dataset.id ? state.notes.find((note) => note.id === form.dataset.id) : { id: uid('note') };
      Object.assign(item, { title: data.title.trim(), content: data.content.trim(), pinned: data.pinned === 'on', updatedAt: new Date().toISOString() });
      if (!form.dataset.id) state.notes.unshift(item);
      selectedNoteId = item.id;
      saveState(); closeModal(); render(); showToast('笔记已保存', 'success');
    } else if (type === 'event') {
      if (!data.title.trim() || !data.date) return showToast('请填写标题和日期', 'error');
      if (data.endTime && data.time && timeToMinutes(data.endTime) <= timeToMinutes(data.time)) return showToast('结束时间需要晚于开始时间', 'error');
      const item = form.dataset.id ? state.events.find((e) => e.id === form.dataset.id) : { id: uid('event') };
      Object.assign(item, { title: data.title.trim(), date: data.date, time: data.time, endTime: data.endTime, type: data.type, place: data.place.trim(), note: data.note.trim(), color: data.type === '考试' ? 'purple' : data.type === '截止' ? 'teal' : 'orange' });
      if (!form.dataset.id) state.events.push(item);
      saveState(); closeModal(); calendarCursor = dateFromKey(data.date); render(); showToast('日历事件已保存', 'success');
    } else if (type === 'goal') {
      if (!data.title.trim()) return showToast('请填写目标', 'error');
      const item = form.dataset.id ? state.goals.find((goal) => goal.id === form.dataset.id) : { id: uid('goal') };
      Object.assign(item, { title: data.title.trim(), target: data.target.trim(), progress: clamp(Number(data.progress) || 0, 0, 100), due: data.due || '' });
      if (!form.dataset.id) state.goals.push(item);
      saveState(); closeModal(); render(); showToast('目标已保存', 'success');
    } else if (type === 'profile') {
      state.profile.name = data.name.trim() || '同学'; state.profile.major = data.major.trim() || '探索新学期';
      saveState(); closeModal(); render(); showToast('资料已更新', 'success');
    } else if (type === 'semester') {
      if (!data.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.startDate)) return showToast('请选择有效的开学日期', 'error');
      Object.assign(state.profile, { term: data.term.trim() || '大二上学期', academicYear: data.academicYear.trim(), startDate: data.startDate, totalWeeks: clamp(Number(data.totalWeeks) || 20, 1, 40) });
      saveState(); closeModal(); render(); showToast('学期设置已保存', 'success');
    } else if (type === 'daily') {
      Object.assign(state.daily, { water: clamp(Number(data.water) || 0, 0, 40), waterGoal: clamp(Number(data.waterGoal) || 8, 1, 40), mood: data.mood, sleep: data.sleep.trim(), journal: data.journal.trim() });
      saveState(); closeModal(); render(); showToast('今日记录已保存', 'success');
    } else if (type === 'focus-settings') {
      const minutes = clamp(Number(data.minutes) || 25, 5, 180); state.focus.duration = minutes * 60; state.focus.remaining = minutes * 60; state.focus.running = false; state.focus.endsAt = null; saveState(); closeModal(); render(); showToast(`已调整为 ${minutes} 分钟`);
    } else if (type === 'weekly-review') {
      const reviewWeek = getSemesterWeek(new Date());
      const note = { id: uid('note'), title: `${reviewWeek ? `第 ${reviewWeek} 周` : '开学前'}复盘`, content: data.content.trim(), pinned: true, updatedAt: new Date().toISOString() }; state.notes.unshift(note); selectedNoteId = note.id; saveState(); closeModal(); setView('notes'); showToast('周复盘已保存到笔记', 'success');
    }
  }

  function handleChange(event) {
    const el = event.target;
    if (el.matches('[data-setting]')) {
      const key = el.dataset.setting;
      if (key === 'notifications') {
        if (el.checked) {
          // Request permission from the user's checkbox gesture; browsers
          // reject notification prompts triggered by a later timer.
          el.checked = false;
          requestBrowserNotification();
          return;
        }
        state.settings.notifications = false;
      } else if (key === 'theme') state.settings.theme = el.checked ? 'dark' : 'light';
      else state.settings[key] = el.checked;
      saveState(); render();
      if (key === 'reminderEnabled') checkReminders({ source: 'setting' });
    }
    if (el.matches('[data-setting-value]')) {
      const key = el.dataset.settingValue;
      if (key === 'reminderInterval') state.settings.reminderInterval = [15, 30, 60].includes(Number(el.value)) ? Number(el.value) : 30;
      saveState(); render();
      showToast(`提醒检查频率已调整为每 ${state.settings.reminderInterval} 分钟`, 'success');
    }
    if (el.matches('[data-action="focus-task"]')) { state.focus.selectedTask = el.value; saveState(); }
    if (el.id === 'import-file' && el.files && el.files[0]) {
      importJson(el.files[0]);
      // Reset so selecting the same backup file again still emits change.
      el.value = '';
    }
    if (el.id === 'ocr-file' && el.files && el.files[0]) {
      importTimetableImage(el.files[0]);
      // Reset so selecting the same screenshot again still emits change.
      el.value = '';
    }
    if (el.matches('[data-action="sort-tasks"]')) {
      plannerSort = el.value === 'priority' ? 'priority' : 'due';
      render();
    }
  }

  function exportJson() {
    const payload = { ...state, exportedAt: new Date().toISOString(), appVersion: APP_VERSION };
    download(`campusflow-backup-${todayKey()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    showToast('JSON 备份已下载', 'success');
  }
  function exportCsv() {
    const rows = [['类型', '标题/课程', '日期/星期', '时间/节次', '地点/分类', '状态/教师']];
    state.tasks.forEach((task) => rows.push(['任务', task.title, task.due || '', task.time || '', task.category || '', task.status === 'done' ? '已完成' : '待完成']));
    state.courses.forEach((course) => rows.push(['课程', course.name, `周${DAY_NAMES[course.day - 1]}`, PERIODS[course.period - 1]?.time || '', course.room || '', course.teacher || '']));
    const csv = '\ufeff' + rows.map((row) => row.map((cell) => `"${String(cell == null ? '' : cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    download(`campusflow-data-${todayKey()}.csv`, csv, 'text/csv;charset=utf-8');
    showToast('CSV 已下载', 'success');
  }
  function download(filename, content, type) {
    const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(reader.result);
        if (!incoming || !Array.isArray(incoming.tasks) || !Array.isArray(incoming.courses)) throw new Error('格式不完整');
        if (!window.confirm('导入会覆盖当前计划、课表和习惯数据，确定继续吗？建议先导出当前备份。')) return;
        const previous = state;
        state = {
          ...state,
          ...incoming,
          settings: normalizeSettings(incoming.settings, previous.settings),
          updatedAt: new Date().toISOString()
        };
        ['tasks', 'courses', 'events', 'habits', 'notes', 'goals'].forEach((key) => {
          if (!Array.isArray(state[key])) state[key] = previous[key] || [];
        });
        state.tasks = normalizeTasks(state.tasks);
        state.courses = normalizeCollectionIds(state.courses, 'course');
        state.events = normalizeCollectionIds(state.events, 'event');
        state.habits = normalizeCollectionIds(state.habits, 'habit');
        state.notes = normalizeCollectionIds(state.notes, 'note');
        state.goals = normalizeCollectionIds(state.goals, 'goal');
        state.profile = normalizeProfile(incoming.profile, previous.profile);
        state.daily = normalizeDaily(incoming.daily, previous.daily);
        const focusRecovery = recoverExpiredFocus(incoming.focus, previous.focus, state.tasks);
        state.focus = focusRecovery.focus;
        state.schemaVersion = Math.max(2, Math.min(999, Math.floor(Number(incoming.schemaVersion) || 0)));
        state.changelog = mergeChangelog(incoming.changelog || previous.changelog);
        saveState(); render(); showToast('备份已恢复', 'success');
      } catch (error) { showToast(`导入失败：${error.message || '文件格式不正确'}`, 'error'); }
    };
    reader.readAsText(file);
  }

  function handleKeydown(event) {
    const backdrop = $('#modal-backdrop');
    if (backdrop && !backdrop.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
      if (event.key === 'Tab') {
        const modal = $('#modal');
        const focusable = modal ? $$('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])', modal).filter((element) => element.offsetParent !== null) : [];
        if (!focusable.length) { event.preventDefault(); modal?.focus(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
      // Do not let global shortcuts mutate the page while a dialog is open.
      if (event.key !== 'Tab') return;
    }
    const sidebar = $('#sidebar');
    if (event.key === 'Escape' && sidebar?.classList.contains('open')) {
      event.preventDefault();
      setSidebarOpen(false, { returnFocus: true });
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && document.activeElement?.matches('.search-box')) {
      event.preventDefault();
      $('#global-search')?.focus();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && document.activeElement?.matches('[data-action="select-note"][role="button"]')) {
      event.preventDefault();
      document.activeElement.click();
      return;
    }
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#global-search')?.focus(); return; }
    if (event.key.toLowerCase() === 'n') { event.preventDefault(); openModal('新建任务', '把下一步写清楚，开始就会变得容易。', taskForm()); }
    if (event.key.toLowerCase() === 't') { event.preventDefault(); currentWeek = startOfWeek(new Date()); calendarCursor = new Date(); setView('dashboard'); }
    if (event.key === '[' && currentView === 'timetable') { currentWeek = addDays(currentWeek, -7); render(); }
    if (event.key === ']' && currentView === 'timetable') { currentWeek = addDays(currentWeek, 7); render(); }
  }

  function bindViewShortcuts() {
    if (focusTick && !state.focus.running) { clearInterval(focusTick); focusTick = null; }
    if (state.focus.running && !focusTick) focusTick = setInterval(tickFocus, 1000);
  }

  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('change', handleChange);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', syncSidebarA11y);
  window.addEventListener('hashchange', () => {
    const nextView = location.hash.slice(1);
    if (!VIEW_TITLES[nextView] || nextView === currentView) return;
    currentView = nextView;
    render();
    checkReminders({ source: 'route' });
  });
  $('#global-search')?.addEventListener('input', (event) => {
    searchTerm = event.target.value.trim();
    if (searchTerm && currentView !== 'planner' && currentView !== 'notes') setView('planner');
    else render();
  });
  $('#modal-backdrop')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) closeModal(); });

  // PWA 在通过 http(s) 访问时启用；直接双击 index.html 仍可完整使用本地功能。
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    // Bypass the old worker's CacheStorage entry during upgrades; otherwise a
    // cache-first worker can keep serving its own stale sw.js forever.
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'campusflow-open-view' && VIEW_TITLES[event.data.view]) setView(event.data.view);
    });
  }
  render();
  syncSidebarA11y();
  initReminderChecks();
  window.CampusFlow = { get state() { return state; }, render, exportJson, exportCsv };
})();
