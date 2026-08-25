/* CampusFlow · 大二计划
 * 无依赖、离线优先的学习与生活计划工具。
 * 所有数据存储在当前浏览器的 localStorage，可在设置中导出/恢复。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'campusflow-state-v1';
  const APP_VERSION = '1.0.0';
  const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];
  const COLORS = ['teal', 'orange', 'purple', 'blue'];
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
  const relativeDue = (key) => {
    if (!key) return '未设置日期';
    const diff = Math.round((dateFromKey(key) - dateFromKey(todayKey())) / 86400000);
    if (diff < 0) return `逾期 ${Math.abs(diff)} 天`;
    if (diff === 0) return '今天';
    if (diff === 1) return '明天';
    if (diff < 7) return `${diff} 天后`;
    return formatShort(key);
  };

  function seedState() {
    const today = new Date();
    const week = startOfWeek(today);
    const d = (offset) => dateKey(addDays(today, offset));
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      profile: { name: '同学', major: '探索新学期', academicYear: `${today.getFullYear()}–${today.getFullYear() + 1}`, term: '大二上学期', startDate: d(7), totalWeeks: 20 },
      settings: { theme: 'light', density: 'comfortable', autoEvent: true, notifications: true },
      tasks: [
        { id: uid('task'), title: '完成高数第一章预习', desc: '看完课程视频并整理 1 页笔记', due: d(1), time: '20:00', priority: 'high', category: '课程', status: 'todo', estimate: 60, course: '高等数学' },
        { id: uid('task'), title: '英语四级词汇打卡', desc: '完成今日 40 个单词', due: d(0), time: '21:30', priority: 'medium', category: '成长', status: 'todo', estimate: 25, course: '' },
        { id: uid('task'), title: '整理社团招新海报', desc: '和宣传部确认最终文案', due: d(3), time: '18:00', priority: 'low', category: '社团', status: 'todo', estimate: 45, course: '' },
        { id: uid('task'), title: '提交暑期实践报告', desc: '检查格式后上传系统', due: d(-1), time: '23:00', priority: 'high', category: '课程', status: 'done', estimate: 30, course: '' }
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
      focus: { duration: 25 * 60, remaining: 25 * 60, running: false, endsAt: null, sessions: 4, selectedTask: '' },
      changelog: [{ version: APP_VERSION, date: '2026-08-25', text: '首个稳定版：计划、课表、日历、习惯、笔记与数据备份。' }]
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seedState();
      const parsed = JSON.parse(raw);
      const seeded = seedState();
      return {
        ...seeded, ...parsed,
        profile: { ...seeded.profile, ...(parsed.profile || {}) },
        settings: { ...seeded.settings, ...(parsed.settings || {}) },
        daily: { ...seeded.daily, ...(parsed.daily || {}) },
        focus: { ...seeded.focus, ...(parsed.focus || {}) },
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : seeded.tasks,
        courses: Array.isArray(parsed.courses) ? parsed.courses : seeded.courses,
        events: Array.isArray(parsed.events) ? parsed.events : seeded.events,
        habits: Array.isArray(parsed.habits) ? parsed.habits : seeded.habits,
        notes: Array.isArray(parsed.notes) ? parsed.notes : seeded.notes,
        goals: Array.isArray(parsed.goals) ? parsed.goals : seeded.goals,
        changelog: Array.isArray(parsed.changelog) ? parsed.changelog : seeded.changelog
      };
    } catch (error) {
      console.warn('CampusFlow state could not be loaded', error);
      return seedState();
    }
  }

  let state = loadState();
  let currentView = 'dashboard';
  let currentWeek = startOfWeek(new Date());
  let calendarCursor = new Date();
  let selectedNoteId = state.notes[0] ? state.notes[0].id : null;
  let plannerFilter = 'all';
  let plannerSort = 'due';
  let searchTerm = '';
  let focusTick = null;
  let lastFocusState = null;
  let modalReturnFocus = null;

  function saveState() {
    state.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { showToast('浏览器存储空间不足，请导出备份', 'error'); }
  }

  function showToast(message, type) {
    const stack = $('#toast-stack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type || ''}`;
    toast.textContent = message;
    stack.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3300);
  }

  function setView(view) {
    currentView = VIEW_TITLES[view] ? view : 'dashboard';
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === currentView));
    $('#page-title').textContent = VIEW_TITLES[currentView];
    $('#sidebar')?.classList.remove('open');
    render();
  }

  function render() {
    document.body.classList.toggle('dark', state.settings.theme === 'dark');
    document.documentElement.dataset.density = state.settings.density || 'comfortable';
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
    return `<div class="task-row" data-task-id="${task.id}">
      <button class="task-check ${done ? 'done' : ''}" data-action="toggle-task" data-id="${task.id}" aria-label="${done ? '标记未完成' : '标记完成'}">${done ? '✓' : ''}</button>
      <div class="priority-dot ${task.priority || 'low'}"></div>
      <div class="task-main"><span class="task-title ${done ? 'done' : ''}">${escapeHtml(task.title)}</span><span class="task-meta"><span class="${dueClass}">${relativeDue(task.due)}</span>${task.category ? `<span>· ${escapeHtml(task.category)}</span>` : ''}${task.time ? `<span>· ${escapeHtml(task.time)}</span>` : ''}</span></div>
      <div class="task-actions"><button class="icon-btn subtle" data-action="edit-task" data-id="${task.id}" aria-label="编辑任务">✎</button><button class="icon-btn subtle" data-action="delete-task" data-id="${task.id}" aria-label="删除任务">×</button></div>
    </div>`;
  }

  function renderDashboard() {
    const today = todayKey();
    const todo = state.tasks.filter((task) => task.status !== 'done');
    const done = state.tasks.filter((task) => task.status === 'done');
    const todayTasks = state.tasks.filter((task) => task.due === today).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const todayHabits = state.habits.map((habit) => ({ habit, done: Boolean(habit.logs && habit.logs[today]) }));
    const completedHabits = todayHabits.filter((item) => item.done).length;
    const completion = state.tasks.length ? Math.round(done.length / state.tasks.length * 100) : 0;
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(new Date()), i));
    const nextCourse = getNextCourse();
    const nextCourseLabel = nextCourse ? `${nextCourse.name} · 周${DAY_NAMES[nextCourse.day - 1]} ${PERIODS[nextCourse.period - 1]?.time || ''}` : '今天没有安排课程，留一点时间给自己。';
    const semesterWeek = getSemesterWeek(new Date());
    const weekLabel = semesterWeek === 0 ? '开学前' : `第 ${semesterWeek} 周 / 共 ${state.profile.totalWeeks || 20} 周`;
    return `${viewHeading('Good morning', `早上好，${escapeHtml(state.profile.name || '同学')} 👋`, `大二${state.profile.term && state.profile.term.includes('下') ? '下' : '上'}学期 · ${weekLabel}`, `<button class="btn btn-ghost" data-action="open-updates">✦ 更新 ${APP_VERSION}</button><button class="btn btn-primary" data-action="new-task">＋ 新建任务</button>`)}
      <div class="grid dashboard-grid">
        <div><div class="welcome-card"><div class="eyebrow">今日提醒</div><h2>${escapeHtml(nextCourseLabel)}</h2><p>${todayTasks.length ? `今天还有 ${todayTasks.length} 项待办，先完成最重要的一件。` : '安排得很好，今天给自己留一点探索时间。'}</p><span class="welcome-quote">Small steps, big semester.</span></div>
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
      const matchesSearch = !searchTerm || `${task.title} ${task.desc} ${task.category}`.toLowerCase().includes(searchTerm.toLowerCase());
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
    return `${viewHeading('Plan & do', '计划与任务', '把学期目标拆成今天可以完成的小步。', '<button class="btn btn-ghost" data-action="new-goal">＋ 学期目标</button><button class="btn btn-primary" data-action="new-task">＋ 新建任务</button>')}
      <div class="toolbar"><div class="segmented">${[['all', '全部'], ['todo', '待完成'], ['done', '已完成'], ['overdue', '已逾期']].map(([value, label]) => `<button class="${plannerFilter === value ? 'active' : ''}" data-action="planner-filter" data-filter="${value}">${label}</button>`).join('')}</div><div class="heading-actions"><select class="select" data-action="sort-tasks" aria-label="排序任务"><option value="due" ${plannerSort === 'due' ? 'selected' : ''}>按截止日期</option><option value="priority" ${plannerSort === 'priority' ? 'selected' : ''}>按优先级</option></select><button class="btn btn-ghost btn-sm" data-action="export-csv">导出 CSV</button></div></div>
      <div class="planner-columns"><div class="card"><div class="card-header"><h3>${filtered.length} 项任务</h3><span class="tag teal">${state.tasks.filter((t) => t.status === 'done').length} 已完成</span></div>${Object.keys(groups).length ? Object.entries(groups).map(([key, items]) => `<div class="plan-group"><div class="plan-date ${key === todayKey() ? 'today-label' : ''}">${key === 'none' ? '未设置日期' : formatDate(key, { month: 'long', day: 'numeric', weekday: 'short' })}<span class="tag ${key < todayKey() ? 'orange' : ''}">${key === 'none' ? '' : relativeDue(key)}</span></div>${items.map((task) => `<div class="plan-item" data-task-id="${task.id}"><button class="task-check ${task.status === 'done' ? 'done' : ''}" data-action="toggle-task" data-id="${task.id}" aria-label="切换完成状态">${task.status === 'done' ? '✓' : ''}</button><div class="priority-dot ${task.priority || 'low'}"></div><div class="plan-copy"><strong class="${task.status === 'done' ? 'done' : ''}">${escapeHtml(task.title)}</strong><p>${escapeHtml(task.desc || '没有备注')} · ${escapeHtml(task.category || '未分类')}</p></div><button class="icon-btn subtle" data-action="edit-task" data-id="${task.id}" aria-label="编辑任务">✎</button></div>`).join('')}</div>`).join('') : '<div class="empty-state"><span class="empty-icon">✓</span>没有符合条件的任务。<br /><button class="btn btn-ghost btn-sm" data-action="new-task">创建第一项</button></div>'}</div>
        <div class="card"><div class="card-header"><h3>学期目标</h3><button class="muted-link" data-action="new-goal">＋ 添加</button></div><div class="milestone-list">${state.goals.length ? state.goals.map((goal) => `<div class="milestone"><div class="milestone-top"><strong>${escapeHtml(goal.title)}</strong><span>${goal.progress || 0}%</span></div><p class="form-hint">${escapeHtml(goal.target || '')} · 截止 ${formatShort(goal.due)}</p><div class="progress-track"><div class="progress-fill" style="width:${clamp(Number(goal.progress) || 0, 0, 100)}%"></div></div><div class="item-actions" style="opacity:1;margin-top:8px"><button class="btn btn-ghost btn-sm" data-action="edit-goal" data-id="${goal.id}">编辑</button><button class="btn btn-ghost btn-sm" data-action="delete-goal" data-id="${goal.id}">删除</button></div></div>`).join('') : '<div class="empty-state">还没有目标，给这个学期一个方向吧。</div>'}</div></div></div>`;
  }

  function renderTimetable() {
    const weekStart = currentWeek;
    const weekEnd = addDays(weekStart, 6);
    const weekLabel = `${weekStart.getFullYear()} / ${weekStart.getMonth() + 1} / ${weekStart.getDate()} — ${weekEnd.getMonth() + 1} / ${weekEnd.getDate()}`;
    const today = todayKey();
    const dayHeads = DAY_NAMES.map((name, index) => { const date = dateKey(addDays(weekStart, index)); return `<div class="week-day-head ${date === today ? 'today' : ''}">周${name}<strong>${dateFromKey(date).getDate()}</strong></div>`; }).join('');
    const semesterWeek = getSemesterWeek(weekStart);
    const cells = PERIODS.map((period) => `<div class="period-label"><strong>${period.id}</strong><span>${period.time.split('–')[0]}</span></div>${DAY_NAMES.map((_, index) => {
      const course = state.courses.find((item) => Number(item.day) === index + 1 && Number(item.period) <= period.id && Number(item.period) + Math.max(1, Number(item.duration) || 1) > period.id && courseRunsThisWeek(item, semesterWeek));
      const isStart = course && Number(course.period) === period.id;
      return `<div class="period-cell" data-day="${index + 1}" data-period="${period.id}">${course ? `<button class="course-block ${course.color || 'teal'} ${isStart ? '' : 'course-continuation'}" data-action="edit-course" data-id="${course.id}" aria-label="编辑${escapeHtml(course.name)}"><strong>${isStart ? escapeHtml(course.name) : '↳ ' + escapeHtml(course.name)}</strong><span>${escapeHtml(course.room || '待定')} · ${escapeHtml(course.teacher || '')}</span></button>` : `<button class="course-add" data-action="new-course" data-day="${index + 1}" data-period="${period.id}" aria-label="添加课程">＋</button>`}</div>`;
    }).join('')}`).join('');
    const thisWeek = startOfWeek(new Date()).getTime() === weekStart.getTime();
    const weekLabelText = semesterWeek === 0 ? '开学前' : `第 ${semesterWeek} 周`;
    return `${viewHeading('Timetable', '我的课表', `${thisWeek ? '本周' : '自定义周'} · ${weekLabelText} · 点击空白格添加课程`, '<button class="btn btn-ghost" data-action="go-current-week">回到本周</button><button class="btn btn-primary" data-action="new-course">＋ 添加课程</button>')}
      <div class="card timetable-card"><div class="timetable-head"><div class="week-nav"><button class="icon-btn" data-action="week-prev" aria-label="上一周">‹</button><strong>${weekLabel}</strong><button class="icon-btn" data-action="week-next" aria-label="下一周">›</button></div><div class="heading-actions"><button class="btn btn-ghost btn-sm" data-action="export-csv">导出表格</button><button class="btn btn-ghost btn-sm" data-action="open-updates">更新中心</button></div></div><div class="week-grid"><div class="week-corner"></div>${dayHeads}${cells}</div><div class="course-summary"><div class="summary-pill"><strong>${state.courses.length}</strong><span>门课程</span></div><div class="summary-pill"><strong>${state.courses.reduce((sum, course) => sum + (Number(course.credits) || 0), 0)}</strong><span>学分</span></div><div class="summary-pill"><strong>${state.courses.filter((course) => course.day <= 5).length}</strong><span>工作日课程</span></div></div></div>`;
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
      const items = [...state.events.filter((event) => event.date === key), ...state.tasks.filter((task) => task.due === key).map((task) => ({ ...task, title: task.title, type: '任务' }))];
      return `<button class="calendar-cell ${inMonth ? '' : 'muted'} ${key === todayKey() ? 'today' : ''}" data-action="calendar-day" data-date="${key}"><span class="calendar-day-num">${date.getDate()}</span><span class="calendar-items">${items.slice(0, 3).map((item) => `<i class="${item.color || 'teal'}" title="${escapeHtml(item.title)}"></i>`).join('')}</span></button>`;
    }).join('');
    const upcomingEnd = dateKey(addDays(dateFromKey(todayKey()), 7));
    const upcoming = [...state.events.map((e) => ({ ...e, kind: '事件' })), ...state.tasks.filter((t) => t.status !== 'done' && t.due).map((t) => ({ ...t, title: t.title, date: t.due, time: t.time, kind: '任务' }))].filter((item) => item.date >= todayKey() && item.date <= upcomingEnd).sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time))).slice(0, 8);
    return `${viewHeading('Calendar', '日历', '考试、截止日期和生活安排都在这里，先看全局再排今天。', '<button class="btn btn-ghost" data-action="calendar-today">今天</button><button class="btn btn-primary" data-action="new-event">＋ 新建事件</button>')}
      <div class="calendar-layout"><div class="card calendar-card"><div class="calendar-toolbar"><button class="icon-btn" data-action="month-prev" aria-label="上个月">‹</button><h2>${calendarCursor.getFullYear()} 年 ${calendarCursor.getMonth() + 1} 月</h2><button class="icon-btn" data-action="month-next" aria-label="下个月">›</button></div><div class="calendar-week-head">${DAY_NAMES.map((name) => `<span>周${name}</span>`).join('')}</div><div class="calendar-grid">${cells}</div></div><div class="card"><div class="card-header"><h3>未来 7 天</h3><span class="tag teal">${upcoming.length} 项</span></div><div class="upcoming-list">${upcoming.length ? upcoming.map((item) => `<button class="upcoming-item" data-action="calendar-day" data-date="${item.date}" data-event-id="${item.kind === '事件' ? item.id : ''}"><span class="upcoming-date">${formatShort(item.date)}<small>${item.time || '全天'}</small></span><span class="upcoming-copy"><strong>${escapeHtml(item.title)}</strong><small>${item.kind} · ${escapeHtml(item.place || item.category || '未分类')}</small></span><span class="upcoming-arrow">›</span></button>`).join('') : '<div class="empty-state">未来 7 天没有安排。</div>'}</div></div></div>`;
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
      <div class="notes-layout"><div class="card"><div class="card-header"><h3>全部笔记</h3><span class="tag orange">${notes.length} 篇</span></div><div class="notes-list">${notes.length ? notes.map((note) => `<div class="note-item ${note.id === selectedNoteId ? 'selected' : ''}" data-action="select-note" data-id="${note.id}"><span class="note-pin">${note.pinned ? '★' : '✦'}</span><div class="note-copy"><strong>${escapeHtml(note.title)}</strong><p>${escapeHtml(note.content)}</p><time>${formatDate(dateKey(new Date(note.updatedAt)), { month: 'numeric', day: 'numeric' })}</time></div><div class="item-actions"><button class="icon-btn subtle" data-action="edit-note" data-id="${note.id}" aria-label="编辑笔记">✎</button></div></div>`).join('') : '<div class="empty-state"><span class="empty-icon">▤</span>写下第一条笔记吧。</div>'}</div></div><div class="note-editor-card"><div class="quote-mark">“</div>${selected ? `<div class="eyebrow">${selected.pinned ? 'Pinned note' : 'Note'}</div><h3>${escapeHtml(selected.title)}</h3><p>${escapeHtml(selected.content)}</p><button class="btn btn-ghost btn-sm" style="margin-top:18px" data-action="edit-note" data-id="${selected.id}">编辑这条笔记</button>` : '<h3>从一个念头开始</h3><p>记录课程灵感、项目想法或此刻的心情。</p><button class="btn btn-ghost btn-sm" style="margin-top:18px" data-action="new-note">写下来</button>'}</div></div>`;
  }

  function renderInsights() {
    const done = state.tasks.filter((task) => task.status === 'done').length;
    const overdue = state.tasks.filter((task) => task.status !== 'done' && task.due && task.due < todayKey()).length;
    const taskRate = state.tasks.length ? Math.round(done / state.tasks.length * 100) : 0;
    const week = Array.from({ length: 7 }, (_, i) => dateKey(addDays(startOfWeek(new Date()), i)));
    const trend = week.map((key) => state.tasks.filter((t) => t.due === key && t.status === 'done').length);
    const max = Math.max(1, ...trend);
    const habitTotal = state.habits.reduce((sum, h) => sum + week.filter((key) => h.logs && h.logs[key]).length, 0);
    const focusMinutes = Math.round((state.focus.sessions || 0) * ((state.focus.duration || 1500) / 60));
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
    const focusMinutes = Math.round((state.focus.sessions || 0) * ((state.focus.duration || 1500) / 60));
    return `${viewHeading('Focus mode', '专注计时', '选择一个任务，给它一段不被打断的时间。', '<button class="btn btn-ghost" data-action="focus-settings">调整时长</button>')}
      <div class="focus-layout"><div class="card focus-timer-card"><div class="focus-orbit"><div class="focus-time" id="focus-time">${pad(minutes)}:${pad(seconds)}</div><span>${focus.running ? '正在专注' : '准备好了吗？'}</span></div><div class="focus-controls"><button class="btn btn-primary" data-action="focus-toggle">${focus.running ? '暂停' : '开始专注'}</button><button class="btn btn-ghost" data-action="focus-reset">重置</button></div><p class="form-hint">完成一轮后会自动记录当前时长；切换页面也不会丢失进度。</p></div><div class="card card-pad"><div class="card-header" style="padding:0"><h3>本轮专注任务</h3><span class="tag orange">${state.focus.sessions || 0} 次累计</span></div><select class="focus-task-select" data-action="focus-task" aria-label="选择专注任务"><option value="">自由专注</option>${tasks.map((task) => `<option value="${task.id}" ${state.focus.selectedTask === task.id ? 'selected' : ''}>${escapeHtml(task.title)}</option>`).join('')}</select><div class="focus-tips"><div><strong>${Math.round((state.focus.duration || 1500) / 60)} / 5</strong><span>当前节奏</span></div><div><strong>${Math.round(focusMinutes / 60 * 10) / 10}h</strong><span>累计时长</span></div></div></div></div>`;
  }

  function renderSettings() {
    const updated = state.updatedAt ? new Date(state.updatedAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    return `${viewHeading('Workspace', '设置', '调整你的学期、外观与数据备份。', '<button class="btn btn-primary" data-action="save-settings">保存设置</button>')}
      <div class="settings-grid"><div class="card card-pad"><div class="settings-section"><div class="eyebrow">Profile</div><h3>个人与学期</h3><div class="settings-row"><span><strong>${escapeHtml(state.profile.name || '同学')}</strong><small>${escapeHtml(state.profile.major || '未填写专业')}</small></span><button class="btn btn-ghost btn-sm" data-action="edit-profile">编辑</button></div><div class="settings-row"><span><strong>${escapeHtml(state.profile.term || '大二上学期')}</strong><small>开学日 ${formatShort(state.profile.startDate)} · ${state.profile.totalWeeks || 20} 周</small></span><button class="btn btn-ghost btn-sm" data-action="edit-semester">调整</button></div></div><div class="settings-section"><div class="eyebrow">Appearance</div><h3>外观与提醒</h3><label class="setting-control"><span>深色模式</span><input type="checkbox" data-setting="theme" ${state.settings.theme === 'dark' ? 'checked' : ''} /><i></i></label><label class="setting-control"><span>任务到期时自动加入日历</span><input type="checkbox" data-setting="autoEvent" ${state.settings.autoEvent ? 'checked' : ''} /><i></i></label><label class="setting-control"><span>桌面提醒</span><input type="checkbox" data-setting="notifications" ${state.settings.notifications ? 'checked' : ''} /><i></i></label></div></div><div><div class="card card-pad"><div class="eyebrow">Backup & sync</div><h3>数据安全</h3><p class="settings-copy">最后保存：${updated}<br />数据只在本机保存，建议每周导出一次备份。</p><div class="settings-actions"><button class="btn btn-primary" data-action="export-json">↓ 导出 JSON 备份</button><button class="btn btn-ghost" data-action="import-json">↑ 导入备份</button><button class="btn btn-ghost" data-action="export-csv">导出课表 CSV</button></div></div><div class="card card-pad update-card"><div class="eyebrow">Update center</div><h3>CampusFlow ${APP_VERSION}</h3><p class="settings-copy">当前版本稳定运行。最近更新：计划、课表、日历、习惯与专注计时。</p><button class="btn btn-ghost btn-sm" data-action="check-update">检查更新</button><span class="update-time">本地数据版本 ${state.schemaVersion || 1} · ${updated}</span></div><div class="card card-pad shortcuts-card"><div class="eyebrow">Shortcuts</div><h3>快捷键</h3><div class="shortcut-row"><kbd>N</kbd><span>新建任务</span><kbd>T</kbd><span>回到今天</span></div><div class="shortcut-row"><kbd>⌘/Ctrl K</kbd><span>聚焦搜索</span><kbd>Esc</kbd><span>关闭弹窗</span></div></div></div></div>`;
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

  function getNextCourse() {
    const courses = state.courses.filter((course) => courseRunsThisWeek(course, getSemesterWeek(new Date()))).sort((a, b) => Number(a.day) - Number(b.day) || Number(a.period) - Number(b.period));
    if (!courses.length) return null;
    const now = new Date();
    const day = now.getDay() || 7;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const future = courses.find((course) => {
      if (Number(course.day) > day) return true;
      if (Number(course.day) < day) return false;
      const start = PERIODS[(Number(course.period) || 1) - 1]?.time?.split('–')[0];
      return timeToMinutes(start) >= currentMinutes;
    });
    return future || courses[0];
  }

  function courseRunsThisWeek(course, weekNumber) {
    // 开学前用于预览课表；开学后支持 1-16、单周/双周等常见写法。
    if (!course || weekNumber === 0 || !course.weeks) return true;
    const rule = String(course.weeks).trim().toLowerCase();
    if (rule.includes('单周')) return weekNumber % 2 === 1;
    if (rule.includes('双周')) return weekNumber % 2 === 0;
    const range = rule.match(/(\d+)\s*[-~至]\s*(\d+)/);
    if (range) return weekNumber >= Number(range[1]) && weekNumber <= Number(range[2]);
    const listed = rule.match(/\d+/g);
    if (listed && listed.length) return listed.map(Number).includes(weekNumber);
    return true;
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

  function getStreak(habit) {
    let streak = 0;
    let cursor = new Date();
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
    if (selected) selected.focusMinutes = (selected.focusMinutes || 0) + Math.round((state.focus.duration || 1500) / 60);
    state.focus.sessions = (state.focus.sessions || 0) + 1;
    state.focus.running = false;
    state.focus.endsAt = null;
    state.focus.remaining = state.focus.duration || 1500;
    saveState();
    showToast('完成一轮专注，太棒了！', 'success');
  }

  function tickFocus() {
    if (currentView !== 'focus') return;
    const snapshot = getFocusSnapshot();
    const time = $('#focus-time');
    if (time) time.textContent = `${pad(Math.floor(snapshot.remaining / 60))}:${pad(snapshot.remaining % 60)}`;
    const label = $('.focus-orbit > span');
    if (label) label.textContent = snapshot.running ? '正在专注' : '准备好了吗？';
  }

  function openModal(title, subtitle, body, options) {
    const backdrop = $('#modal-backdrop');
    const modal = $('#modal');
    if (!backdrop || !modal) return;
    const active = document.activeElement;
    modalReturnFocus = active && active !== document.body ? active : null;
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
    backdrop.hidden = true;
    const returnFocus = modalReturnFocus;
    modalReturnFocus = null;
    if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
  }

  function taskForm(task) {
    const editing = Boolean(task);
    return `<form data-form="task" data-id="${editing ? task.id : ''}"><div class="form-grid"><div class="form-field full"><label for="task-title">任务标题 *</label><input id="task-title" name="title" required maxlength="80" value="${escapeHtml(task?.title || '')}" placeholder="例如：完成数据结构第三章习题" /></div><div class="form-field full"><label for="task-desc">备注</label><textarea id="task-desc" name="desc" maxlength="500" placeholder="写下下一步动作或需要的资料">${escapeHtml(task?.desc || '')}</textarea></div><div class="form-field"><label for="task-due">截止日期</label><input id="task-due" name="due" type="date" value="${task?.due || todayKey()}" /></div><div class="form-field"><label for="task-time">截止时间</label><input id="task-time" name="time" type="time" value="${task?.time || ''}" /></div><div class="form-field"><label for="task-priority">优先级</label><select id="task-priority" name="priority"><option value="low" ${task?.priority === 'low' ? 'selected' : ''}>低</option><option value="medium" ${task?.priority === 'medium' ? 'selected' : ''}>中</option><option value="high" ${task?.priority === 'high' ? 'selected' : ''}>高</option></select></div><div class="form-field"><label for="task-category">分类</label><select id="task-category" name="category"><option ${!task?.category ? 'selected' : ''}>课程</option><option ${task?.category === '成长' ? 'selected' : ''}>成长</option><option ${task?.category === '社团' ? 'selected' : ''}>社团</option><option ${task?.category === '生活' ? 'selected' : ''}>生活</option><option ${task?.category === '其他' ? 'selected' : ''}>其他</option></select></div><div class="form-field"><label for="task-estimate">预计时长（分钟）</label><input id="task-estimate" name="estimate" type="number" min="5" max="999" step="5" value="${task?.estimate || 30}" /></div></div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-action="close-modal">取消</button><button class="btn btn-primary" type="submit">${editing ? '保存修改' : '添加任务'}</button></div></form>`;
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
    const logs = (state.changelog || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
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
    if (action === 'toggle-sidebar') return $('#sidebar')?.classList.toggle('open');
    if (action === 'toggle-theme') { state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark'; saveState(); render(); return; }
    if (action === 'go-today') { currentWeek = startOfWeek(new Date()); calendarCursor = new Date(); setView('dashboard'); return; }
    if (action === 'new-task') { openModal('新建任务', '把下一步写清楚，开始就会变得容易。', taskForm()); return; }
    if (action === 'edit-task') { const task = state.tasks.find((item) => item.id === id); if (task) openModal('编辑任务', '修改后会立即同步到总览与日历。', taskForm(task)); return; }
    if (action === 'toggle-task') { const task = state.tasks.find((item) => item.id === id); if (task) { task.status = task.status === 'done' ? 'todo' : 'done'; saveState(); render(); showToast(task.status === 'done' ? '任务完成，做得好！' : '已恢复为待完成'); } return; }
    if (action === 'delete-task') { if (window.confirm('确定删除这项任务吗？删除后仍可通过 JSON 备份恢复。')) { state.tasks = state.tasks.filter((item) => item.id !== id); saveState(); render(); showToast('任务已删除'); } return; }
    if (action === 'planner-filter') { plannerFilter = target.dataset.filter || 'all'; render(); return; }
    if (action === 'new-course') { openModal('添加课程', '固定课程会显示在每周课表中，可随时修改。', courseForm(null, { day: target.dataset.day, period: target.dataset.period })); return; }
    if (action === 'edit-course') { const course = state.courses.find((item) => item.id === id); if (course) openModal('编辑课程', '修改后会保留在本地课表中。', courseForm(course)); return; }
    if (action === 'delete-course') { if (window.confirm('确定删除这门课程吗？')) { state.courses = state.courses.filter((item) => item.id !== id); saveState(); closeModal(); render(); showToast('课程已删除'); } return; }
    if (action === 'week-prev') { currentWeek = addDays(currentWeek, -7); render(); return; }
    if (action === 'week-next') { currentWeek = addDays(currentWeek, 7); render(); return; }
    if (action === 'go-current-week') { currentWeek = startOfWeek(new Date()); render(); return; }
    if (action === 'new-habit') { openModal('添加习惯', '从一个小而确定的动作开始。', habitForm()); return; }
    if (action === 'edit-habit') { const habit = state.habits.find((item) => item.id === id); if (habit) openModal('编辑习惯', '可以随时调整目标，不需要完美。', habitForm(habit)); return; }
    if (action === 'delete-habit') { if (window.confirm('归档这个习惯？历史打卡会保留。')) { state.habits = state.habits.filter((item) => item.id !== id); saveState(); closeModal(); render(); showToast('习惯已归档'); } return; }
    if (action === 'toggle-habit') { const habit = state.habits.find((item) => item.id === id); if (habit) { habit.logs ||= {}; habit.logs[todayKey()] = !habit.logs[todayKey()]; saveState(); render(); showToast(habit.logs[todayKey()] ? '打卡成功，连续记录 +1' : '已取消今天打卡'); } return; }
    if (action === 'new-note') { openModal('新建笔记', '先记下来，再慢慢整理。', noteForm()); return; }
    if (action === 'edit-note') { const note = state.notes.find((item) => item.id === id); if (note) openModal('编辑笔记', '你的想法值得被好好保存。', noteForm(note)); return; }
    if (action === 'select-note') { selectedNoteId = id; render(); return; }
    if (action === 'delete-note') { if (window.confirm('确定删除这条笔记吗？')) { state.notes = state.notes.filter((item) => item.id !== id); selectedNoteId = state.notes[0]?.id || null; saveState(); closeModal(); render(); showToast('笔记已删除'); } return; }
    if (action === 'new-event') { openModal('新建日历事件', '把重要日期放进视线里。', eventForm()); return; }
    if (action === 'edit-event') { const item = state.events.find((e) => e.id === id); if (item) openModal('编辑日历事件', '修改后会同步到日历视图。', eventForm(item)); return; }
    if (action === 'delete-event') { if (window.confirm('确定删除这个事件吗？')) { state.events = state.events.filter((e) => e.id !== id); saveState(); closeModal(); render(); showToast('事件已删除'); } return; }
    if (action === 'calendar-day' || action === 'select-day') { const key = target.dataset.date; if (key) { calendarCursor = dateFromKey(key); if (action === 'calendar-day') { const item = target.dataset.eventId ? state.events.find((e) => e.id === target.dataset.eventId) : state.events.find((e) => e.date === key); if (item) openModal('编辑日历事件', '修改后会同步到日历视图。', eventForm(item)); else openModal('新建日历事件', formatDate(key), eventForm({ date: key })); } else { setView('calendar'); } } return; }
    if (action === 'month-prev') { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1); render(); return; }
    if (action === 'month-next') { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1); render(); return; }
    if (action === 'calendar-today') { calendarCursor = new Date(); render(); return; }
    if (action === 'go-focus') { setView('focus'); return; }
    if (action === 'focus-toggle') { toggleFocus(); return; }
    if (action === 'focus-reset') { state.focus.running = false; state.focus.endsAt = null; state.focus.remaining = state.focus.duration || 1500; saveState(); render(); return; }
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
      const item = form.dataset.id ? state.tasks.find((task) => task.id === form.dataset.id) : { id: uid('task'), status: 'todo' };
      Object.assign(item, { title: data.title.trim(), desc: data.desc.trim(), due: data.due, time: data.time, priority: data.priority, category: data.category, estimate: Number(data.estimate) || 30 });
      if (!form.dataset.id) state.tasks.unshift(item);
      saveState(); closeModal(); render(); showToast(form.dataset.id ? '任务已更新' : '任务已添加', 'success');
    } else if (type === 'course') {
      if (!data.name.trim()) return showToast('请填写课程名称', 'error');
      const candidate = { day: Number(data.day), period: Number(data.period), duration: clamp(Number(data.duration) || 1, 1, 3), weeks: data.weeks.trim() };
      const duplicate = state.courses.find((course) => course.id !== form.dataset.id && coursesOverlap(course, candidate));
      if (duplicate) showToast(`提醒：与「${duplicate.name}」时段重叠`, 'error');
      const item = form.dataset.id ? state.courses.find((course) => course.id === form.dataset.id) : { id: uid('course') };
      Object.assign(item, { name: data.name.trim(), code: data.code.trim(), teacher: data.teacher.trim(), room: data.room.trim(), day: candidate.day, period: candidate.period, duration: candidate.duration, weeks: candidate.weeks, color: data.color, credits: Number(data.credits) || 0 });
      if (!form.dataset.id) state.courses.push(item);
      saveState(); closeModal(); render(); showToast(form.dataset.id ? '课程已更新' : '课程已添加', 'success');
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
      if (key === 'theme') state.settings.theme = el.checked ? 'dark' : 'light'; else state.settings[key] = el.checked;
      saveState(); render();
    }
    if (el.matches('[data-action="focus-task"]')) { state.focus.selectedTask = el.value; saveState(); }
    if (el.id === 'import-file' && el.files && el.files[0]) {
      importJson(el.files[0]);
      // Reset so selecting the same backup file again still emits change.
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
        state = { ...state, ...incoming, settings: { ...previous.settings, ...(incoming.settings || {}) }, updatedAt: new Date().toISOString() };
        ['tasks', 'courses', 'events', 'habits', 'notes', 'goals'].forEach((key) => {
          if (!Array.isArray(state[key])) state[key] = previous[key] || [];
        });
        state.profile = { ...previous.profile, ...(incoming.profile || {}) };
        state.daily = { ...previous.daily, ...(incoming.daily || {}) };
        state.focus = { ...previous.focus, ...(incoming.focus || {}) };
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
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#global-search')?.focus(); return; }
    if (event.key.toLowerCase() === 'n') { event.preventDefault(); openModal('新建任务', '把下一步写清楚，开始就会变得容易。', taskForm()); }
    if (event.key.toLowerCase() === 't') { event.preventDefault(); currentWeek = startOfWeek(new Date()); calendarCursor = new Date(); setView('dashboard'); }
    if (event.key === '[' && currentView === 'timetable') { currentWeek = addDays(currentWeek, -7); render(); }
    if (event.key === ']' && currentView === 'timetable') { currentWeek = addDays(currentWeek, 7); render(); }
  }

  function bindViewShortcuts() {
    if (focusTick && currentView !== 'focus') { clearInterval(focusTick); focusTick = null; }
    if (state.focus.running && !focusTick) focusTick = setInterval(tickFocus, 1000);
  }

  document.addEventListener('click', handleClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('change', handleChange);
  document.addEventListener('keydown', handleKeydown);
  $('#global-search')?.addEventListener('input', (event) => {
    searchTerm = event.target.value.trim();
    if (searchTerm && currentView !== 'planner' && currentView !== 'notes') setView('planner');
    else render();
  });
  $('#modal-backdrop')?.addEventListener('click', (event) => { if (event.target === event.currentTarget) closeModal(); });

  // PWA 在通过 http(s) 访问时启用；直接双击 index.html 仍可完整使用本地功能。
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(() => {});
  render();
  window.CampusFlow = { get state() { return state; }, render, exportJson, exportCsv };
})();
