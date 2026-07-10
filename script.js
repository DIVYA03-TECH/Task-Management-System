// State Engine
console.log("Script Loaded");
let currentUser = null;
let tasks = [];
let activityLogs = [];
let activeTab = 'dashboard';
let currentGeneratedTaskId = null;

function initNewTaskTab() {
  currentGeneratedTaskId = tasks.length + 1;
  const idEl = document.getElementById('new-task-generated-id');
  if (idEl) {
    idEl.innerText = `#${currentGeneratedTaskId}`;
  }
  const usernameEl = document.getElementById('new-task-assigned-username');
  if (usernameEl && currentUser) {
    usernameEl.innerText = `@${currentUser.username || 'user'}`;
  }
}

// Config values
let isDarkMode = localStorage.getItem('dark_mode') === 'true';
let isSoundEnabled = localStorage.getItem('sound_enabled') !== 'false';
let isCompactLayout = localStorage.getItem('compact_layout') === 'true';

function syncThemeUI() {
  if (isDarkMode) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  const settingsThemeLabel = document.querySelector('.theme-label-status');
  if (settingsThemeLabel) {
    settingsThemeLabel.innerText = isDarkMode ? 'Dark Mode' : 'Light Mode';
  }
}

// Helper to get local YYYY-MM-DD date string
function getLocalTodayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Calendar parameters
let calendarDate = new Date(); // Initial date set around current context date
let selectedCalendarDateStr = null;

// Filter selectors
let taskCategoryFilter = 'all';

// Chart instances
let chartWeeklyLine = null;
let chartCategoriesDoughnut = null;
let chartProductivityBar = null;
let chartAnalyticsLine = null;
let chartAnalyticsDoughnut = null;
let chartAnalyticsBar = null;

// Web Audio Synthesizer: Play complete chime
function playChime() {
  if (!isSoundEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.12); // G5
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (err) {
    console.warn("Synth block:", err);
  }
}

// Initialize application components
document.addEventListener('DOMContentLoaded', () => {
  // Restore Mode
  syncThemeUI();

  // Check Session
  const session = localStorage.getItem('organizo_user_session');
  if (session) {
    try {
      currentUser = JSON.parse(session);
      showWorkspace();
    } catch (e) {
      localStorage.removeItem('organizo_user_session');
      showAuth();
    }
  } else {
    showAuth();
  }

  setupEventListeners();
});

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('workspace-container').classList.add('hidden');
  lucide.createIcons();
}

function showWorkspace() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('workspace-container').classList.remove('hidden');
  
  // Load user specifics
  document.getElementById('sidebar-user-name').innerText = currentUser.employee_name;
  document.getElementById('sidebar-user-name').nextElementSibling.innerText = `@${currentUser.username}`;
  document.getElementById('sidebar-avatar').innerText = getInitials(currentUser.employee_name);
  document.getElementById('nav-avatar').innerText = getInitials(currentUser.employee_name);
  document.getElementById('settings-display-name').value = currentUser.employee_name;
  syncThemeUI();

  initNewTaskTab();

  // Activity logs loading
  const savedLogs = localStorage.getItem(`organizo_logs_${currentUser.user_id}`);
  activityLogs = savedLogs ? JSON.parse(savedLogs) : [
    { text: "Secure login initialized", time: "04:00 AM", category: "Auth" }
  ];

  fetchTasks();
  // Start recurring reminder check
  setInterval(checkReminders, 10000);
}

function getInitials(name) {
  return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'US';
}

// Helper to add days to a YYYY-MM-DD date string
function addDays(dateStr, days) {
  if (!dateStr) return dateStr;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Dynamic client-side expansion of recurring tasks
function expandRecurringTasks(rawTasks) {
  if (!rawTasks) return [];
  const expanded = [];
  rawTasks.forEach(t => {
    // Add original task
    expanded.push(t);
    
    if (t.repeat && t.repeat !== 'None') {
      let interval = 0;
      let count = 0;
      if (t.repeat.toLowerCase() === 'daily') {
        interval = 1;
        count = 6; // Add 6 more daily occurrences (total 7 days)
      } else if (t.repeat.toLowerCase() === 'weekly') {
        interval = 7;
        count = 3; // Add 3 more weekly occurrences (total 4 weeks)
      } else if (t.repeat.toLowerCase() === 'monthly') {
        interval = 30;
        count = 2; // Add 2 more monthly occurrences
      }
      
      if (interval > 0 && count > 0) {
        for (let i = 1; i <= count; i++) {
          const newDueDate = addDays(t.due_date, i * interval);
          const duplicated = {
            ...t,
            task_id: `${t.task_id}_rep${i}`,
            due_date: newDueDate,
            is_recurring_instance: true
          };
          expanded.push(duplicated);
        }
      }
    }
  });
  return expanded;
}

let notifiedTaskIds = [];

// Check reminders engine
function checkReminders() {
  if (!tasks || tasks.length === 0) return;
  
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  
  // Calculate tomorrow's date string
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomYear = tomorrow.getFullYear();
  const tomMonth = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const tomDay = String(tomorrow.getDate()).padStart(2, '0');
  const tomorrowStr = `${tomYear}-${tomMonth}-${tomDay}`;

  tasks.forEach(t => {
    if (t.status === 'completed') return;
    if (t.reminder === 'None' || !t.reminder) return;
    
    // Skip if already notified in this session
    if (notifiedTaskIds.includes(t.task_id)) return;

    let shouldTrigger = false;
    let message = '';

    if (t.reminder === 'At Time' && t.due_date === todayStr) {
      shouldTrigger = true;
      message = `Task "${t.title}" is due today!`;
    } else if (t.reminder === '15m Before' && t.due_date === todayStr) {
      shouldTrigger = true;
      message = `Upcoming task soon: "${t.title}" (Due today!)`;
    } else if (t.reminder === '1h Before' && t.due_date === todayStr) {
      shouldTrigger = true;
      message = `Task "${t.title}" is due within 1 hour!`;
    } else if (t.reminder === '1d Before' && t.due_date === tomorrowStr) {
      shouldTrigger = true;
      message = `Reminder: Task "${t.title}" is due tomorrow!`;
    } else if (t.due_date === todayStr) {
      // Fallback reminder for today
      shouldTrigger = true;
      message = `Reminder: "${t.title}" is scheduled for today!`;
    }

    if (shouldTrigger) {
      notifiedTaskIds.push(t.task_id);
      showReminderToast(t, message);
    }
  });
}

function showReminderToast(task, message) {
  // Create a floating, premium toast in the top right
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed top-5 right-5 z-[100] space-y-3 pointer-events-none max-w-sm w-full';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto bg-neutral-900/95 dark:bg-neutral-800/95 border border-amber-400 text-white p-4 rounded-2xl shadow-2xl flex items-start gap-3 transform translate-x-12 opacity-0 transition-all duration-300 ease-out';
  toast.innerHTML = `
    <div class="p-1.5 bg-amber-400 text-neutral-900 rounded-lg shrink-0">
      <i data-lucide="bell-ring" class="w-4 h-4"></i>
    </div>
    <div class="flex-1 min-w-0">
      <p class="text-xs font-extrabold text-amber-400 font-mono uppercase tracking-wider">Reminder Alert</p>
      <p class="text-xs font-semibold text-white mt-0.5">${escapeHTML(message)}</p>
      <div class="flex items-center gap-1.5 mt-2">
        <span class="text-[9px] font-bold px-1.5 py-0.5 bg-white/10 text-neutral-300 rounded uppercase font-mono">${task.priority} Priority</span>
        <span class="text-[9px] text-neutral-400 font-mono">#${task.task_id}</span>
      </div>
    </div>
    <button class="toast-close-btn text-neutral-400 hover:text-white cursor-pointer"><i data-lucide="x" class="w-4 h-4"></i></button>
  `;

  container.appendChild(toast);
  lucide.createIcons({ attrs: { class: 'w-4 h-4' } });

  // Trigger audio chime!
  playChime();

  // Slide in animation
  setTimeout(() => {
    toast.classList.remove('translate-x-12', 'opacity-0');
  }, 50);

  const closeToast = () => {
    toast.classList.add('translate-x-12', 'opacity-0');
    setTimeout(() => {
      toast.remove();
    }, 300);
  };

  toast.querySelector('.toast-close-btn').addEventListener('click', closeToast);

  // Auto dismiss after 10 seconds
  setTimeout(closeToast, 10000);
}

// API calls
async function fetchTasks() {
  try {
    const response = await fetch(`/api/tasks/${currentUser.user_id}`);
    if (response.ok) {
      const rawTasks = await response.json();
      tasks = expandRecurringTasks(rawTasks);
      renderAll();
      checkReminders();
    }
  } catch (e) {
    console.error("Error fetching tasks:", e);
  }
}

function pushActivityLog(text, category = "General") {
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  activityLogs.unshift({ text, time: timeStr, category });
  if (activityLogs.length > 25) activityLogs.pop();
  localStorage.setItem(`organizo_logs_${currentUser.user_id}`, JSON.stringify(activityLogs));
  
  // Update notifications indicator badge
  const badge = document.getElementById('bell-badge');
  if (badge) badge.classList.remove('hidden');

  renderActivityList();
}

// Global rendering orchestration
function renderAll() {
  renderDashboardStats();
  renderUpcomingTasks();
  renderCalendar();
  renderFullCalendar();
  renderTasksTab();
  renderCharts();
  renderActivityList();
  renderDatabaseExplorer();
  lucide.createIcons();
}

function renderDashboardStats() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const pending = total - completed;
  
  // Overdue: pending and due date is in the past
  const todayStr = getLocalTodayStr();
  const overdue = tasks.filter(t => t.status === 'pending' && t.due_date && t.due_date < todayStr).length;

  document.getElementById('dash-stat-total').innerText = total;
  document.getElementById('dash-stat-completed').innerText = completed;
  document.getElementById('dash-stat-pending').innerText = pending;
  document.getElementById('dash-stat-overdue').innerText = overdue;

  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
  document.getElementById('dash-stat-completed-rate').innerText = `${rate}% Completion rate`;

  // Update Greeting with user name
  const hour = new Date().getHours();
  let greeting = "Good Morning";
  if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
  if (hour >= 17) greeting = "Good Evening";
  document.getElementById('dashboard-greeting').innerText = `${greeting}, ${currentUser.employee_name}`;
}

// Render upcoming tasks list widget
function renderUpcomingTasks() {
  const container = document.getElementById('dash-tasks-list');
  const filtered = tasks.filter(t => {
    // Filter by calendar selected date if selected
    if (selectedCalendarDateStr) {
      return t.due_date === selectedCalendarDateStr;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="py-12 text-center text-xs text-neutral-400">No matching tasks found.</div>`;
    return;
  }

  container.innerHTML = filtered.slice(0, 8).map(t => {
    const isComp = t.status === 'completed';
    const normPriority = (t.priority || '').toLowerCase();
    const pClass = normPriority === 'high' ? 'bg-red-50 text-red-500 border border-red-100 dark:bg-red-950/20 dark:text-red-400' : 
                   normPriority === 'medium' ? 'bg-amber-50 text-amber-500 border border-amber-100 dark:bg-amber-950/20 dark:text-amber-400' : 
                   'bg-emerald-50 text-emerald-500 border border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400';
                   
    return `
      <div class="flex items-center justify-between p-3.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-100 dark:border-neutral-850 rounded-[16px] transition-all hover:border-amber-200 ${isCompactLayout ? 'py-2' : ''}">
        <div class="flex items-center gap-3 min-w-0">
          <input type="checkbox" class="task-checkbox-toggle w-4 h-4 rounded border-neutral-300 dark:border-neutral-700 accent-amber-400 cursor-pointer" data-id="${t.task_id}" ${isComp ? 'checked' : ''}>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-1.5 mb-1">
              <span class="text-[8.5px] font-mono font-bold px-1.5 py-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-md">ID: #${t.task_id}</span>
              <span class="text-[8.5px] font-mono font-medium px-1.5 py-0.5 bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 rounded-md">@${escapeHTML(t.username || currentUser.username || 'user')}</span>
            </div>
            <h4 class="text-xs font-semibold ${isComp ? 'line-through text-neutral-400 dark:text-neutral-500' : 'text-neutral-800 dark:text-neutral-100'} truncate">${escapeHTML(t.title)}</h4>
            <p class="text-[10px] text-neutral-400 truncate">${escapeHTML(t.description || 'No description')}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${pClass}">${t.priority}</span>
          <span class="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-850 text-neutral-500 text-[9px] font-mono rounded-md">${t.due_date}</span>
          <button class="task-delete-btn p-1 hover:bg-red-50 text-neutral-400 hover:text-red-500 rounded cursor-pointer" data-id="${t.task_id}"><i data-lucide="trash-2" class="w-3.5 h-3.5 pointer-events-none"></i></button>
        </div>
      </div>
    `;
  }).join('');
  
  lucide.createIcons();
}

// Render Full List view in Task Tab
function renderTasksTab() {
  const grid = document.getElementById('tasks-grid');
  const searchVal = document.getElementById('tasks-search').value.toLowerCase();
  const priorityVal = document.getElementById('filter-priority').value.toLowerCase();
  const statusVal = document.getElementById('filter-status').value;
  
  const filtered = tasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchVal) || (t.description && t.description.toLowerCase().includes(searchVal));
    const matchesPriority = priorityVal === 'all' || (t.priority && t.priority.toLowerCase() === priorityVal);
    const matchesStatus = statusVal === 'all' || t.status === statusVal;
    const matchesCategory = taskCategoryFilter === 'all' || t.category === taskCategoryFilter;
    return matchesSearch && matchesPriority && matchesStatus && matchesCategory;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center text-xs text-neutral-400 bg-white dark:bg-neutral-900 rounded-[20px] border border-amber-50 dark:border-neutral-850">
        No tasks matching filters. Add a new task to get started!
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(t => {
    const isComp = t.status === 'completed';
    const normPriority = (t.priority || '').toLowerCase();
    const pClass = normPriority === 'high' ? 'bg-red-50 text-red-500 dark:bg-red-950/20 dark:text-red-400' : 
                   normPriority === 'medium' ? 'bg-amber-50 text-amber-500 dark:bg-amber-950/20 dark:text-amber-400' : 
                   'bg-emerald-50 text-emerald-500 dark:bg-emerald-950/20 dark:text-emerald-400';
    return `
      <div class="bg-white dark:bg-neutral-900 border border-amber-100/40 dark:border-neutral-800 rounded-[20px] p-5 shadow-sm hover:border-amber-300 dark:hover:border-neutral-700 transition-all flex flex-col justify-between ${isCompactLayout ? 'p-3.5' : ''}">
        <div>
          <div class="flex items-center justify-between mb-3">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold rounded-lg uppercase tracking-wide">${t.category || 'Work'}</span>
              <span class="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-500 text-[10px] font-mono font-bold rounded-lg">#${t.task_id}</span>
              <span class="px-2 py-0.5 bg-sky-100/60 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 text-[10px] font-mono font-bold rounded-lg">@${escapeHTML(t.username || currentUser.username || 'user')}</span>
            </div>
            <span class="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wide ${pClass}">${t.priority}</span>
          </div>
          <h4 class="text-sm font-bold text-neutral-800 dark:text-neutral-100 ${isComp ? 'line-through text-neutral-400 dark:text-neutral-500' : ''}">${escapeHTML(t.title)}</h4>
          <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-1.5 line-clamp-3">${escapeHTML(t.description || 'No additional notes provided.')}</p>
        </div>
        
        <div class="mt-5 pt-3.5 border-t border-neutral-100 dark:border-neutral-800/80 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <input type="checkbox" class="task-checkbox-toggle w-4 h-4 rounded border-neutral-300 dark:border-neutral-700 accent-amber-400 cursor-pointer" data-id="${t.task_id}" ${isComp ? 'checked' : ''}>
            <span class="text-[11px] font-semibold ${isComp ? 'text-emerald-500' : 'text-neutral-400'}">${isComp ? 'Completed' : 'Pending'}</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="text-[10px] text-neutral-400 font-mono flex items-center gap-1"><i data-lucide="calendar" class="w-3 h-3 text-neutral-400"></i> ${t.due_date}</span>
            <button class="task-delete-btn p-1.5 hover:bg-red-50 text-neutral-400 hover:text-red-500 rounded-lg cursor-pointer" data-id="${t.task_id}"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// Render interactive mini calendar
function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  document.getElementById('cal-title').innerText = `${monthNames[month]} ${year}`;

  // Days of the month
  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const prevLastDay = new Date(year, month, 0).getDate();

  let daysHtml = '';

  // Previous month filler days
  for (let x = firstDayIndex; x > 0; x--) {
    daysHtml += `<div class="p-1.5 text-neutral-300 dark:text-neutral-700 font-medium">${prevLastDay - x + 1}</div>`;
  }

  // Current month days
  const todayStr = getLocalTodayStr();
  for (let i = 1; i <= lastDay; i++) {
    const curDateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    
    // Highlight active calendar filter
    const isSelected = selectedCalendarDateStr === curDateStr;
    const isToday = todayStr === curDateStr;
    
    // Check if there are tasks on this day
    const dayTasks = tasks.filter(t => t.due_date === curDateStr);
    const hasTasks = dayTasks.length > 0;
    const isAllComp = hasTasks && dayTasks.every(t => t.status === 'completed');

    let dotClass = '';
    if (hasTasks) {
      const isOverdue = dayTasks.some(t => t.status !== 'completed' && curDateStr < todayStr);
      if (isAllComp) {
        dotClass = 'border-b-2 border-emerald-500';
      } else if (isOverdue) {
        dotClass = 'border-b-2 border-rose-500';
      } else {
        dotClass = 'border-b-2 border-amber-400';
      }
    }

    let bgClass = 'hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg';
    if (isSelected) {
      bgClass = 'bg-amber-400 text-neutral-900 rounded-lg font-bold shadow-sm';
    } else if (isToday) {
      bgClass = 'bg-neutral-200 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg font-bold';
    }

    daysHtml += `
      <button class="cal-day-btn p-1.5 cursor-pointer font-medium relative flex flex-col items-center justify-between ${bgClass} ${dotClass}" data-date="${curDateStr}">
        <span>${i}</span>
      </button>
    `;
  }

  grid.innerHTML = daysHtml;

  // Update filter active message below
  const filterMsg = document.getElementById('calendar-filter-msg');
  if (selectedCalendarDateStr) {
    filterMsg.innerText = `Filtering dashboard tasks for due date: ${selectedCalendarDateStr}`;
    filterMsg.classList.remove('hidden');
  } else {
    filterMsg.classList.add('hidden');
  }
}

// Full Calendar parameters
let fullCalendarDate = new Date();
let selectedFullCalendarDateStr = getLocalTodayStr();

function renderFullCalendar() {
  const monthYearEl = document.getElementById('monthYear');
  const calendarEl = document.getElementById('calendar');
  if (!monthYearEl || !calendarEl) return;

  const year = fullCalendarDate.getFullYear();
  const month = fullCalendarDate.getMonth();
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  monthYearEl.innerText = `${monthNames[month]} ${year}`;

  // Calculate days
  const firstDayIndex = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const prevLastDay = new Date(year, month, 0).getDate();

  let daysHtml = '';

  // Previous month filler days (dimmed)
  for (let x = firstDayIndex; x > 0; x--) {
    const dayNum = prevLastDay - x + 1;
    daysHtml += `
      <div class="p-3 text-neutral-300 dark:text-neutral-700 bg-neutral-50/20 dark:bg-neutral-900/10 border border-neutral-100 dark:border-neutral-800/40 rounded-xl min-h-[90px] opacity-40 select-none">
        <span class="text-xs font-mono font-semibold">${dayNum}</span>
      </div>
    `;
  }

  // Current month days
  const todayStr = getLocalTodayStr();
  for (let i = 1; i <= lastDay; i++) {
    const curDateStr = `${year}-${String(month+1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    
    const isSelected = selectedFullCalendarDateStr === curDateStr;
    const isToday = todayStr === curDateStr;
    
    // Find tasks due on this date
    const dayTasks = tasks.filter(t => t.due_date === curDateStr);
    const hasTasks = dayTasks.length > 0;
    
    let taskIndicatorsHtml = '';
    if (hasTasks) {
      taskIndicatorsHtml += `<div class="flex flex-wrap gap-1 mt-1 justify-start w-full">`;
      dayTasks.slice(0, 3).forEach(t => {
        const isOverdue = t.status !== 'completed' && curDateStr < todayStr;
        let dotColor = 'bg-amber-400'; // Yellow for pending
        if (t.status === 'completed') {
          dotColor = 'bg-emerald-500'; // Green for completion
        } else if (isOverdue) {
          dotColor = 'bg-rose-500'; // Red if date exceeded
        }
        taskIndicatorsHtml += `
          <span class="w-1.5 h-1.5 rounded-full ${dotColor} inline-block shadow-sm" title="${escapeHTML(t.title)}"></span>
        `;
      });
      if (dayTasks.length > 3) {
        taskIndicatorsHtml += `
          <span class="text-[8px] text-neutral-400 font-bold font-mono">+${dayTasks.length - 3}</span>
        `;
      }
      taskIndicatorsHtml += `</div>`;
    }

    let bgClass = 'bg-white dark:bg-neutral-900/80 border-neutral-100 dark:border-neutral-800 text-neutral-850 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800/80';
    if (isSelected) {
      bgClass = 'bg-amber-50 border-amber-400 text-amber-950 dark:bg-amber-950/40 dark:border-amber-500 dark:text-amber-300 font-bold shadow-sm';
    } else if (isToday) {
      bgClass = 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 font-bold';
    }

    daysHtml += `
      <button class="full-cal-day-btn p-2.5 cursor-pointer font-medium relative flex flex-col items-start justify-between min-h-[90px] rounded-xl border transition-all hover:scale-[1.02] ${bgClass}" data-date="${curDateStr}">
        <span class="text-xs font-mono">${i}</span>
        ${taskIndicatorsHtml}
      </button>
    `;
  }

  // Next month filler days (dimmed)
  const totalCells = firstDayIndex + lastDay;
  const remaining = 42 - totalCells; // Standard 6-row grid
  for (let i = 1; i <= remaining; i++) {
    daysHtml += `
      <div class="p-3 text-neutral-300 dark:text-neutral-700 bg-neutral-50/20 dark:bg-neutral-900/10 border border-neutral-100 dark:border-neutral-800/40 rounded-xl min-h-[90px] opacity-40 select-none">
        <span class="text-xs font-mono font-semibold">${i}</span>
      </div>
    `;
  }

  calendarEl.innerHTML = daysHtml;

  // Register day click events
  calendarEl.querySelectorAll('.full-cal-day-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const dateStr = e.currentTarget.getAttribute('data-date');
      selectedFullCalendarDateStr = dateStr;
      renderFullCalendar();
    });
  });

  renderFullCalendarTaskList();
}

function renderFullCalendarTaskList() {
  const selectedDateEl = document.getElementById('selectedDate');
  const taskListEl = document.getElementById('taskList');
  if (!selectedDateEl || !taskListEl) return;

  if (!selectedFullCalendarDateStr) {
    selectedDateEl.innerText = 'Select a Date';
    taskListEl.innerHTML = `
      <div class="py-8 text-center text-xs text-neutral-400 select-none">
        Click a date to view scheduled tasks.
      </div>
    `;
    return;
  }

  // Formatted selected date
  const dateParts = selectedFullCalendarDateStr.split('-');
  const formattedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  selectedDateEl.innerText = formattedDate;

  // Get tasks for selected date
  const dayTasks = tasks.filter(t => t.due_date === selectedFullCalendarDateStr);

  if (dayTasks.length === 0) {
    taskListEl.innerHTML = `
      <div class="py-12 text-center text-xs text-neutral-400 flex flex-col items-center justify-center gap-2 select-none">
        <i data-lucide="check-circle" class="w-8 h-8 text-neutral-300 dark:text-neutral-700"></i>
        <span>No tasks scheduled for this day. Click "+ Add Task" to create one.</span>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  taskListEl.innerHTML = dayTasks.map(t => {
    const isComp = t.status === 'completed';
    const priorityBadge = t.priority === 'High' ? 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 border-rose-800/30' :
                          t.priority === 'Medium' ? 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 border-amber-800/30' :
                          'bg-sky-50 text-sky-600 border-sky-100 dark:bg-sky-950/20 dark:text-sky-400 border-sky-800/30';
    return `
      <div class="p-4 bg-neutral-50 dark:bg-neutral-850 border border-neutral-100 dark:border-neutral-800/80 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:border-neutral-200 dark:hover:border-neutral-700">
        <div class="flex items-center gap-3">
          <input type="checkbox" class="task-checkbox-toggle rounded border-neutral-300 text-amber-500 focus:ring-amber-400 cursor-pointer w-4 h-4" data-id="${t.task_id}" ${isComp ? 'checked' : ''}>
          <div>
            <h4 class="text-xs font-bold text-neutral-800 dark:text-neutral-200 ${isComp ? 'line-through text-neutral-400 dark:text-neutral-500' : ''}">${escapeHTML(t.title)}</h4>
            <p class="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">${escapeHTML(t.description || 'No description.')}</p>
            <div class="flex items-center gap-2 mt-1.5 flex-wrap">
              <span class="text-[9px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider ${priorityBadge}">${t.priority}</span>
              <span class="text-[9px] px-2 py-0.5 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-mono">${t.category || 'general'}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1 self-end md:self-auto">
          <button class="task-delete-btn p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-neutral-400 hover:text-rose-500 rounded-lg cursor-pointer transition-colors" data-id="${t.task_id}">
            <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// Render Recent Activity Lists
function renderActivityList() {
  // Small Navbar logs
  const bellList = document.getElementById('bell-list');
  if (activityLogs.length === 0) {
    bellList.innerHTML = `<div class="py-4 text-center">No logs recorded.</div>`;
  } else {
    bellList.innerHTML = activityLogs.slice(0, 5).map(log => `
      <div class="py-1 border-b border-neutral-100 dark:border-neutral-800/60 flex justify-between gap-1">
        <span class="truncate">${escapeHTML(log.text)}</span>
        <span class="text-[9px] text-neutral-400 font-mono shrink-0">${log.time}</span>
      </div>
    `).join('');
  }

  // Large Dashboard log list
  const dashList = document.getElementById('dash-activity-list');
  if (activityLogs.length === 0) {
    dashList.innerHTML = `<div class="py-8 text-center text-xs text-neutral-400">No activities logged.</div>`;
  } else {
    dashList.innerHTML = activityLogs.slice(0, 8).map(log => {
      let icon = 'activity';
      let color = 'text-amber-500';
      if (log.category === 'Auth') { icon = 'shield-check'; color = 'text-sky-500'; }
      else if (log.category === 'Complete') { icon = 'check-circle'; color = 'text-emerald-500'; }
      else if (log.category === 'Create') { icon = 'plus-circle'; color = 'text-amber-500'; }
      else if (log.category === 'Delete') { icon = 'trash-2'; color = 'text-rose-500'; }

      return `
        <div class="flex items-center justify-between p-2.5 bg-neutral-50 dark:bg-neutral-950 rounded-xl border border-neutral-100 dark:border-neutral-850/60">
          <div class="flex items-center gap-2 min-w-0">
            <div class="p-1.5 bg-white dark:bg-neutral-900 rounded-lg ${color}"><i data-lucide="${icon}" class="w-3.5 h-3.5"></i></div>
            <p class="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate">${escapeHTML(log.text)}</p>
          </div>
          <span class="text-[9px] text-neutral-400 font-mono shrink-0 ml-1">${log.time}</span>
        </div>
      `;
    }).join('');
  }
}

// Chart.js initialization and updates
function renderCharts() {
  // Destroy existing charts to prevent canvas leakage/errors
  if (chartWeeklyLine) chartWeeklyLine.destroy();
  if (chartCategoriesDoughnut) chartCategoriesDoughnut.destroy();
  if (chartProductivityBar) chartProductivityBar.destroy();
  if (chartAnalyticsLine) chartAnalyticsLine.destroy();
  if (chartAnalyticsDoughnut) chartAnalyticsDoughnut.destroy();
  if (chartAnalyticsBar) chartAnalyticsBar.destroy();

  // Aggregate data
  // 1. Line Chart: Last 7 days task completion
  const days = [];
  const lineData = [];
  const barDataCreated = [];
  const barDataCompleted = [];
  
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    // Safely format as local YYYY-MM-DD string
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dayStr = `${year}-${month}-${day}`;
    days.push(`${dayNames[d.getDay()]} (${d.getDate()})`);
    
    const comps = tasks.filter(t => t.status === 'completed' && t.completed_date === dayStr).length;
    const crests = tasks.filter(t => t.created_at === dayStr).length;
    lineData.push(comps);
    barDataCompleted.push(comps);
    barDataCreated.push(crests);
  }

  // Draw Weekly Line Chart
  const lineCanvas = document.getElementById('lineChartWeekly');
  if (lineCanvas) {
    const lineCtx = lineCanvas.getContext('2d');
    chartWeeklyLine = new Chart(lineCtx, {
      type: 'line',
      data: {
        labels: days,
        datasets: [{
          label: 'Completed Tasks',
          data: lineData,
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251, 191, 36, 0.15)',
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#fbbf24',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, color: '#888888' }, grid: { borderDash: [4,4] } },
          x: { ticks: { color: '#888888' } }
        }
      }
    });
  }

  // 2. Categories Doughnut Chart
  const catCount = { Work: 0, Personal: 0, Shopping: 0, Ideas: 0, None: 0 };
  tasks.forEach(t => {
    const cat = t.category || 'None';
    if (catCount[cat] !== undefined) catCount[cat]++;
    else catCount['Work']++;
  });

  const donutCanvas = document.getElementById('doughnutChartCategories');
  if (donutCanvas) {
    const donutCtx = donutCanvas.getContext('2d');
    chartCategoriesDoughnut = new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(catCount),
        datasets: [{
          data: Object.values(catCount),
          backgroundColor: ['#fbbf24', '#38bdf8', '#34d399', '#f87171', '#a3a3a3'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, color: '#888888' } }
        },
        cutout: '70%'
      }
    });
  }

  // 3. Productivity Bar Chart
  const barCanvas = document.getElementById('barChartProductivity');
  if (barCanvas) {
    const barCtx = barCanvas.getContext('2d');
    chartProductivityBar = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [
          {
            label: 'Created',
            data: barDataCreated,
            backgroundColor: '#e5e7eb',
            borderRadius: 4
          },
          {
            label: 'Completed',
            data: barDataCompleted,
            backgroundColor: '#fbbf24',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#888888' } } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0, color: '#888888' }, grid: { borderDash: [4,4] } },
          x: { ticks: { color: '#888888' } }
        }
      }
    });
  }

  // Mirror line chart to Analytics tab if visible
  const analyticsLineCanvas = document.getElementById('analyticsLineChart');
  if (analyticsLineCanvas) {
    const analyticsLineCtx = analyticsLineCanvas.getContext('2d');
    chartAnalyticsLine = new Chart(analyticsLineCtx, {
      type: 'line',
      data: {
        labels: days,
        datasets: [{
          label: 'Completed',
          data: lineData,
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56, 189, 248, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.3
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  const analyticsDonutCanvas = document.getElementById('analyticsDoughnutChart');
  if (analyticsDonutCanvas) {
    const analyticsDonutCtx = analyticsDonutCanvas.getContext('2d');
    chartAnalyticsDoughnut = new Chart(analyticsDonutCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(catCount),
        datasets: [{ data: Object.values(catCount), backgroundColor: ['#fbbf24', '#38bdf8', '#34d399', '#f87171', '#a3a3a3'], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%' }
    });
  }

  const analyticsBarCanvas = document.getElementById('analyticsBarChart');
  if (analyticsBarCanvas) {
    const analyticsBarCtx = analyticsBarCanvas.getContext('2d');
    chartAnalyticsBar = new Chart(analyticsBarCtx, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [
          { label: 'Created', data: barDataCreated, backgroundColor: '#38bdf8', borderRadius: 4 },
          { label: 'Completed', data: barDataCompleted, backgroundColor: '#34d399', borderRadius: 4 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

// Cache for database explorer tables
let dbCachedData = { users: [], tasks: [] };

// SQLite3 Raw database explorer rendering
async function renderDatabaseExplorer() {
  try {
    const res = await fetch('/api/db/tables');
    if (res.ok) {
      const data = await res.json();
      dbCachedData = data; // cache for dynamic client filtering
      
      // Populate settings tab Users table
      const usersBody = document.getElementById('explorer-users-body');
      if (usersBody) {
        document.getElementById('explorer-users-count').innerText = `${data.users.length} Rows`;
        if (data.users.length === 0) {
          usersBody.innerHTML = `<tr><td colspan="3" class="p-3 text-center text-neutral-400">0 rows found.</td></tr>`;
        } else {
          usersBody.innerHTML = data.users.map(u => `
            <tr class="hover:bg-neutral-50 dark:hover:bg-neutral-850">
              <td class="p-2.5 font-bold">${u.user_id}</td>
              <td class="p-2.5">${escapeHTML(u.employee_name)}</td>
              <td class="p-2.5 text-amber-500">${escapeHTML(u.username)}</td>
            </tr>
          `).join('');
        }
      }

      // Populate settings tab Tasks table
      const tasksBody = document.getElementById('explorer-tasks-body');
      if (tasksBody) {
        document.getElementById('explorer-tasks-count').innerText = `${data.tasks.length} Rows`;
        if (data.tasks.length === 0) {
          tasksBody.innerHTML = `<tr><td colspan="6" class="p-3 text-center text-neutral-400">0 rows found.</td></tr>`;
        } else {
          tasksBody.innerHTML = data.tasks.slice(0, 15).map(t => `
            <tr class="hover:bg-neutral-50 dark:hover:bg-neutral-850">
              <td class="p-2.5 font-bold">${t.task_id}</td>
              <td class="p-2.5">${t.user_id}</td>
              <td class="p-2.5 text-sky-500 font-bold">@${escapeHTML(t.username || currentUser.username || 'user')}</td>
              <td class="p-2.5 truncate max-w-[140px]">${escapeHTML(t.title)}</td>
              <td class="p-2.5 text-neutral-400">${t.category}</td>
              <td class="p-2.5 ${t.status === 'completed' ? 'text-emerald-500 font-bold' : 'text-amber-500'}">${t.status}</td>
            </tr>
          `).join('');
        }
      }

      // Populate Dedicated DB Tab stats and tables
      filterAndRenderDbTables();
    }
  } catch (err) {
    console.warn("DB Explorer fetch error:", err);
  }
}

// Interactive client-side filtration for live SQLite tables
function filterAndRenderDbTables() {
  if (!dbCachedData) return;

  // Stats
  const uCount = dbCachedData.users ? dbCachedData.users.length : 0;
  const tCount = dbCachedData.tasks ? dbCachedData.tasks.length : 0;
  
  const statUsers = document.getElementById('db-stat-users');
  if (statUsers) statUsers.innerText = `${uCount} Rows`;
  const statTasks = document.getElementById('db-stat-tasks');
  if (statTasks) statTasks.innerText = `${tCount} Rows`;

  const usersBadge = document.getElementById('db-users-badge-count');
  if (usersBadge) usersBadge.innerText = `${uCount} Rows`;
  const tasksBadge = document.getElementById('db-tasks-badge-count');
  if (tasksBadge) tasksBadge.innerText = `${tCount} Rows`;

  // Filter Users
  const usersSearchVal = (document.getElementById('db-users-search')?.value || '').toLowerCase().trim();
  const filteredUsers = (dbCachedData.users || []).filter(u => {
    return u.user_id.toString().includes(usersSearchVal) ||
           (u.employee_name || '').toLowerCase().includes(usersSearchVal) ||
           (u.username || '').toLowerCase().includes(usersSearchVal);
  });

  const dbUsersBody = document.getElementById('db-users-body');
  if (dbUsersBody) {
    if (filteredUsers.length === 0) {
      dbUsersBody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-neutral-400">No matching user rows found.</td></tr>`;
    } else {
      dbUsersBody.innerHTML = filteredUsers.map(u => `
        <tr class="hover:bg-neutral-50 dark:hover:bg-neutral-850/40">
          <td class="p-2.5 font-bold">${u.user_id}</td>
          <td class="p-2.5">${escapeHTML(u.employee_name)}</td>
          <td class="p-2.5 text-amber-500">${escapeHTML(u.username)}</td>
        </tr>
      `).join('');
    }
  }

  // Filter Tasks
  const tasksSearchVal = (document.getElementById('db-tasks-search')?.value || '').toLowerCase().trim();
  const filteredTasks = (dbCachedData.tasks || []).filter(t => {
    return t.task_id.toString().includes(tasksSearchVal) ||
           t.user_id.toString().includes(tasksSearchVal) ||
           (t.title || '').toLowerCase().includes(tasksSearchVal) ||
           (t.category || '').toLowerCase().includes(tasksSearchVal) ||
           (t.status || '').toLowerCase().includes(tasksSearchVal);
  });

  const dbTasksBody = document.getElementById('db-tasks-body');
  if (dbTasksBody) {
    if (filteredTasks.length === 0) {
      dbTasksBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-neutral-400">No matching task rows found.</td></tr>`;
    } else {
      dbTasksBody.innerHTML = filteredTasks.map(t => `
        <tr class="hover:bg-neutral-50 dark:hover:bg-neutral-850/40">
          <td class="p-2.5 font-bold">${t.task_id}</td>
          <td class="p-2.5">${t.user_id}</td>
          <td class="p-2.5 text-sky-500 font-bold">@${escapeHTML(t.username || currentUser.username || 'user')}</td>
          <td class="p-2.5 truncate max-w-[150px] font-medium text-neutral-800 dark:text-neutral-200" title="${escapeHTML(t.title)}">${escapeHTML(t.title)}</td>
          <td class="p-2.5"><span class="px-2 py-0.5 rounded-full text-[10px] bg-neutral-100 dark:bg-neutral-800 font-bold">${t.category}</span></td>
          <td class="p-2.5">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${t.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500' : 'bg-amber-50 dark:bg-amber-950/20 text-amber-500'}">
              ${t.status}
            </span>
          </td>
        </tr>
      `).join('');
    }
  }
}

function switchToTab(tabName) {
  const btn = document.querySelector(`.nav-tab-btn[data-tab="${tabName}"]`);
  if (btn) {
    btn.click();
  }
}

// Helper functions
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// Listeners config
function setupEventListeners() {
  // Collapsible Sidebar handler
  const sidebar = document.getElementById('sidebar');
  const toggleIcon = document.getElementById('sidebar-toggle-icon');
  document.getElementById('sidebar-toggle-btn').addEventListener('click', () => {
    sidebar.classList.toggle('w-64');
    sidebar.classList.toggle('w-20');
    const isCollapsed = !sidebar.classList.contains('w-64');
    toggleIcon.setAttribute('data-lucide', isCollapsed ? 'chevron-right' : 'chevron-left');
    
    // Toggle hide labels
    document.querySelectorAll('.sidebar-hideable').forEach(el => {
      el.style.display = isCollapsed ? 'none' : '';
    });
    lucide.createIcons();
  });

  // Tab navigators
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.getAttribute('data-tab');
      if (!tab) return;
      
      activeTab = tab;
      
      // Toggle active classes on tab panels
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      const targetTabEl = document.getElementById(`tab-${tab}`);
      if (targetTabEl) targetTabEl.classList.add('active');

      // Style sidebar tab selectors
      document.querySelectorAll('.nav-tab-btn').forEach(b => {
        b.className = "nav-tab-btn flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors text-neutral-500 hover:text-neutral-800 dark:hover:text-white";
      });
      e.currentTarget.className = "nav-tab-btn flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400";
      
      // Re-trigger chart rendering when viewing charts/analytics or db explorer
      if (tab === 'analytics' || tab === 'dashboard') {
        setTimeout(renderCharts, 10);
      }
      if (tab === 'database') {
        setTimeout(renderDatabaseExplorer, 10);
      }
      if (tab === 'new-task') {
        initNewTaskTab();
      }
      if (tab === 'calendar') {
        setTimeout(renderFullCalendar, 10);
      }
    });
  });

  // Initialize default task date to Context date
  const taskDateInput = document.getElementById('task-date');
  if (taskDateInput) {
    taskDateInput.value = getLocalTodayStr();
  }

  document.getElementById('nav-new-task-btn').addEventListener('click', () => {
    switchToTab('new-task');
  });
  const addBtn = document.getElementById('tasks-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      switchToTab('new-task');
    });
  }

  // Auth toggle panels
  const loginTab = document.getElementById('auth-toggle-login');
  const registerTab = document.getElementById('auth-toggle-register');
  const nameField = document.getElementById('auth-field-name');
  const submitBtn = document.getElementById('auth-submit-btn');
  
  let isRegistering = false;

  loginTab.addEventListener('click', () => {
    isRegistering = false;
    loginTab.className = "flex-1 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm cursor-pointer";
    registerTab.className = "flex-1 py-2 text-xs font-semibold rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer";
    nameField.classList.add('hidden');
    submitBtn.innerText = "Sign In";
  });

  registerTab.addEventListener('click', () => {
    isRegistering = true;
    registerTab.className = "flex-1 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm cursor-pointer";
    loginTab.className = "flex-1 py-2 text-xs font-semibold rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer";
    nameField.classList.remove('hidden');
    submitBtn.innerText = "Create Account";
  });

  // Auth submission form handler
  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('auth-input-username').value;
    const password = document.getElementById('auth-input-password').value;
    const employee_name = document.getElementById('auth-input-name').value;
    const alertEl = document.getElementById('auth-alert');

    alertEl.classList.add('hidden');

    try {
      if (isRegistering) {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_name, username, password })
        });
        const data = await res.json();
        if (res.ok) {
          alertEl.className = "p-3 rounded-xl text-xs font-medium border bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400";
          alertEl.innerText = "Registration complete! You can sign in now.";
          alertEl.classList.remove('hidden');
          // Auto click login tab
          loginTab.click();
        } else {
          alertEl.className = "p-3 rounded-xl text-xs font-medium border bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400";
          alertEl.innerText = data.detail || "Registration failed.";
          alertEl.classList.remove('hidden');
        }
      } else {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
          currentUser = {
            user_id: data.user_id,
            employee_name: data.employee_name,
            username: username
          };
          localStorage.setItem('organizo_user_session', JSON.stringify(currentUser));
          showWorkspace();
          pushActivityLog("Workspace connection verified", "Auth");
        } else {
          alertEl.className = "p-3 rounded-xl text-xs font-medium border bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400";
          alertEl.innerText = data.detail || "Authentication invalid.";
          alertEl.classList.remove('hidden');
        }
      }
    } catch (err) {
      alertEl.className = "p-3 rounded-xl text-xs font-medium border bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-950/20 dark:text-rose-400";
      alertEl.innerText = "Network connection failed.";
      alertEl.classList.remove('hidden');
    }
  });

  // Commit task form submission
  document.getElementById('new-task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('task-title').value;
    const description = document.getElementById('task-desc').value;
    const due_date = document.getElementById('task-date').value;
    const priority = document.getElementById('task-priority').value;
    const category = document.getElementById('task-category').value;
    const repeat = document.getElementById('task-repeat').value;
    const reminder = document.getElementById('task-reminder').value;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.user_id,
          task_id: currentGeneratedTaskId,
          title,
          description,
          due_date,
          priority,
          category,
          repeat,
          reminder,
          employee_name: currentUser.employee_name
        })
      });

      if (res.ok) {
        document.getElementById('new-task-form').reset();
        initNewTaskTab();
        pushActivityLog(`Committed task: "${title}"`, "Create");
        fetchTasks();
        switchToTab('tasks');
      }
    } catch (err) {
      console.error("Create task failed:", err);
    }
  });

  // Delete Confirmation Modal Management
  let taskToDeleteId = null;
  const deleteModal = document.getElementById('deleteConfirmModal');
  const deleteInner = deleteModal ? deleteModal.querySelector('div') : null;

  const showDeleteModal = (id) => {
    if (!deleteModal || !deleteInner) return;
    taskToDeleteId = id;
    deleteModal.classList.remove('hidden');
    deleteModal.classList.add('flex');
    setTimeout(() => {
      deleteInner.classList.remove('scale-95', 'opacity-0');
      deleteInner.classList.add('scale-100', 'opacity-100');
    }, 10);
  };

  const hideDeleteModal = () => {
    if (!deleteModal || !deleteInner) return;
    deleteInner.classList.remove('scale-100', 'opacity-100');
    deleteInner.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      deleteModal.classList.add('hidden');
      deleteModal.classList.remove('flex');
      taskToDeleteId = null;
    }, 300);
  };

  const deleteCancelBtn = document.getElementById('delete-cancel-btn');
  if (deleteCancelBtn) {
    deleteCancelBtn.addEventListener('click', hideDeleteModal);
  }

  const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', async () => {
      if (!taskToDeleteId) return;
      try {
        const res = await fetch(`/api/tasks/${taskToDeleteId}`, { method: 'DELETE' });
        if (res.ok) {
          pushActivityLog(`Deleted task record #${taskToDeleteId}`, "Delete");
          fetchTasks();
        }
      } catch (err) {
        console.error("Delete task failed:", err);
      } finally {
        hideDeleteModal();
      }
    });
  }

  // Quick task state triggers and deletions (Delegation)
  const handleTaskCheckToggle = async (e) => {
    if (e.target.classList.contains('task-checkbox-toggle')) {
      const id = e.target.getAttribute('data-id');
      const isChecked = e.target.checked;
      const status = isChecked ? 'completed' : 'pending';
      
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        if (res.ok) {
          if (isChecked) {
            playChime();
            pushActivityLog(`Completed task record #${id}`, "Complete");
          } else {
            pushActivityLog(`Reopened task record #${id}`, "Pending");
          }
          fetchTasks();
        }
      } catch (err) {
        console.error("Update task status failed:", err);
      }
    }

    if (e.target.closest('.task-delete-btn')) {
      const btn = e.target.closest('.task-delete-btn');
      const id = btn.getAttribute('data-id');
      showDeleteModal(id);
    }
  };

  document.getElementById('dash-tasks-list').addEventListener('click', handleTaskCheckToggle);
  document.getElementById('tasks-grid').addEventListener('click', handleTaskCheckToggle);

  // Search and select filters
  document.getElementById('tasks-search').addEventListener('input', renderTasksTab);
  document.getElementById('filter-priority').addEventListener('change', renderTasksTab);
  document.getElementById('filter-status').addEventListener('change', renderTasksTab);
  
  document.getElementById('top-search').addEventListener('input', (e) => {
    // Sync to search view
    document.getElementById('tasks-search').value = e.target.value;
    // Open tasks tab automatically
    document.querySelector('[data-tab="tasks"]').click();
    renderTasksTab();
  });

  // Categories selectors pills
  document.querySelectorAll('.cat-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      taskCategoryFilter = e.currentTarget.getAttribute('data-cat');
      document.querySelectorAll('.cat-pill').forEach(p => {
        p.className = "cat-pill px-3 py-1 text-neutral-500 hover:text-neutral-800 dark:hover:text-white font-semibold text-xs rounded-lg cursor-pointer transition-all";
      });
      e.currentTarget.className = "cat-pill px-3 py-1 bg-white dark:bg-neutral-900 text-amber-500 font-semibold text-xs rounded-lg shadow-sm cursor-pointer transition-all";
      renderTasksTab();
    });
  });

  // Calendar month switchers
  document.getElementById('cal-prev').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
  });

  // Calendar day filter clicks
  document.getElementById('calendar-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.cal-day-btn');
    if (btn) {
      const dateStr = btn.getAttribute('data-date');
      if (selectedCalendarDateStr === dateStr) {
        // Un-toggle
        selectedCalendarDateStr = null;
      } else {
        selectedCalendarDateStr = dateStr;
      }
      renderCalendar();
      renderUpcomingTasks();
    }
  });

  // Calendar tab month navigation
  const prevMonthBtn = document.getElementById('prevMonth');
  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
      fullCalendarDate.setMonth(fullCalendarDate.getMonth() - 1);
      renderFullCalendar();
    });
  }
  const nextMonthBtn = document.getElementById('nextMonth');
  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
      fullCalendarDate.setMonth(fullCalendarDate.getMonth() + 1);
      renderFullCalendar();
    });
  }
  const todayBtn = document.getElementById('todayBtn');
  if (todayBtn) {
    todayBtn.addEventListener('click', () => {
      fullCalendarDate = new Date();
      selectedFullCalendarDateStr = getLocalTodayStr();
      renderFullCalendar();
    });
  }

  // Add Task Button (Calendar Tab)
  const addTaskBtn = document.getElementById('addTaskBtn');
  if (addTaskBtn) {
    addTaskBtn.addEventListener('click', () => {
      const modal = document.getElementById('taskModal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        const dueDateInput = document.getElementById('dueDate');
        if (dueDateInput) {
          dueDateInput.value = selectedFullCalendarDateStr || '2026-07-09';
        }
      }
    });
  }

  // Close Modal Button (Calendar Tab)
  const closeModalBtn = document.getElementById('closeModal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      const modal = document.getElementById('taskModal');
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    });
  }

  // Task List Event Delegation (Calendar Tab checkboxes and deletes)
  const calendarTaskList = document.getElementById('taskList');
  if (calendarTaskList) {
    calendarTaskList.addEventListener('click', handleTaskCheckToggle);
  }

  // Task Form Submission (Calendar Tab)
  const taskForm = document.getElementById('taskForm');
  if (taskForm) {
    taskForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('title').value;
      const desc = document.getElementById('description').value;
      const dueDateValue = document.getElementById('dueDate').value;
      const priority = document.getElementById('priority').value;

      const randTaskId = tasks.length + 1;

      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: currentUser.user_id,
            task_id: randTaskId,
            title: title,
            description: desc,
            due_date: dueDateValue,
            priority: priority,
            category: 'calendar',
            repeat: 'None',
            reminder: 'None',
            employee_name: currentUser.employee_name
          })
        });

        if (res.ok) {
          taskForm.reset();
          const modal = document.getElementById('taskModal');
          if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
          }
          pushActivityLog(`Committed calendar task: "${title}"`, "Create");
          await fetchTasks();
        }
      } catch (err) {
        console.error("Create calendar task failed:", err);
      }
    });
  }

  // Notification Center UI Dropdown toggles
  const bellBtn = document.getElementById('nav-bell-btn');
  const bellDrop = document.getElementById('bell-dropdown');
  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    bellDrop.classList.toggle('hidden');
    document.getElementById('bell-badge').classList.add('hidden');
  });

  document.getElementById('bell-clear-btn').addEventListener('click', () => {
    activityLogs = [];
    localStorage.setItem(`organizo_logs_${currentUser.user_id}`, JSON.stringify([]));
    renderActivityList();
  });

  // User profile quick controls dropdown
  const profileBtn = document.getElementById('profile-dropdown-btn');
  const profileDrop = document.getElementById('profile-dropdown');
  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDrop.classList.toggle('hidden');
  });

  // Close all dropdowns on body click
  document.addEventListener('click', () => {
    bellDrop.classList.add('hidden');
    profileDrop.classList.add('hidden');
  });

  // Profile dropdown clicks
  document.getElementById('prof-settings-btn').addEventListener('click', () => {
    document.querySelector('[data-tab="settings"]').click();
  });

  const executeLogout = () => {
    localStorage.removeItem('organizo_user_session');
    currentUser = null;
    showAuth();
  };

  const logoutModal = document.getElementById('logoutConfirmModal');
  const logoutInner = logoutModal ? logoutModal.querySelector('div') : null;

  const showLogoutModal = () => {
    if (!logoutModal || !logoutInner) return;
    logoutModal.classList.remove('hidden');
    logoutModal.classList.add('flex');
    setTimeout(() => {
      logoutInner.classList.remove('scale-95', 'opacity-0');
      logoutInner.classList.add('scale-100', 'opacity-100');
    }, 10);
  };

  const hideLogoutModal = () => {
    if (!logoutModal || !logoutInner) return;
    logoutInner.classList.remove('scale-100', 'opacity-100');
    logoutInner.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      logoutModal.classList.add('hidden');
      logoutModal.classList.remove('flex');
    }, 300);
  };

  const cancelBtn = document.getElementById('logout-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', hideLogoutModal);
  }

  const confirmBtn = document.getElementById('logout-confirm-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      hideLogoutModal();
      executeLogout();
    });
  }

  const profLogoutBtn = document.getElementById('prof-logout-btn');
  if (profLogoutBtn) {
    profLogoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showLogoutModal();
    });
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showLogoutModal();
    });
  }

  // Dark Mode Switch
  document.getElementById('theme-toggle').addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    localStorage.setItem('dark_mode', isDarkMode);
    syncThemeUI();
  });

  // Settings Theme Option Toggle
  const settingsThemeBtn = document.getElementById('settings-theme-toggle');
  if (settingsThemeBtn) {
    settingsThemeBtn.addEventListener('click', () => {
      isDarkMode = !isDarkMode;
      localStorage.setItem('dark_mode', isDarkMode);
      syncThemeUI();
      pushActivityLog(`Interface color theme updated to ${isDarkMode ? 'dark' : 'light'}`, "General");
    });
  }

  // Settings Logout Button
  const settingsLogoutBtn = document.getElementById('settings-logout-btn');
  if (settingsLogoutBtn) {
    settingsLogoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showLogoutModal();
    });
  }

  // Settings controllers
  document.getElementById('settings-save-profile').addEventListener('click', () => {
    const nameVal = document.getElementById('settings-display-name').value.trim();
    if (nameVal) {
      currentUser.employee_name = nameVal;
      localStorage.setItem('organizo_user_session', JSON.stringify(currentUser));
      showWorkspace();
      pushActivityLog("Updated display profile details", "General");
      alert("Profile updated successfully!");
    }
  });

  // sound effects settings toggler
  const soundBtn = document.getElementById('settings-toggle-sound');
  soundBtn.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    localStorage.setItem('sound_enabled', isSoundEnabled);
    soundBtn.innerText = isSoundEnabled ? 'Enabled' : 'Disabled';
    pushActivityLog(`Task completion synthesized sounds ${isSoundEnabled ? 'enabled' : 'disabled'}`, "General");
  });

  // compact layout density toggler
  const compactBtn = document.getElementById('settings-toggle-compact');
  compactBtn.addEventListener('click', () => {
    isCompactLayout = !isCompactLayout;
    localStorage.setItem('compact_layout', isCompactLayout);
    compactBtn.innerText = isCompactLayout ? 'Enabled' : 'Disabled';
    pushActivityLog(`Compact density layout switches ${isCompactLayout ? 'enabled' : 'disabled'}`, "General");
    renderAll();
  });

  // SQLite3 explorer sync trigger
  const explorerRefreshBtn = document.getElementById('explorer-refresh');
  if (explorerRefreshBtn) {
    explorerRefreshBtn.addEventListener('click', () => {
      renderDatabaseExplorer();
      pushActivityLog("Sync'd relational database schemas live", "General");
    });
  }

  // 1. Live Client-Side Filtering for Users & Tasks in Dedicated Database tab
  const dbUsersSearchInput = document.getElementById('db-users-search');
  if (dbUsersSearchInput) dbUsersSearchInput.addEventListener('input', filterAndRenderDbTables);
  
  const dbTasksSearchInput = document.getElementById('db-tasks-search');
  if (dbTasksSearchInput) dbTasksSearchInput.addEventListener('input', filterAndRenderDbTables);

  // 2. Refresh database button
  const dbTabRefreshBtn = document.getElementById('db-tab-refresh');
  if (dbTabRefreshBtn) {
    dbTabRefreshBtn.addEventListener('click', async () => {
      const originalHTML = dbTabRefreshBtn.innerHTML;
      dbTabRefreshBtn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Syncing...`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      await renderDatabaseExplorer();
      dbTabRefreshBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-emerald-500"></i> Synced!`;
      if (typeof lucide !== 'undefined') lucide.createIcons();
      setTimeout(() => {
        dbTabRefreshBtn.innerHTML = originalHTML;
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }, 1500);
      pushActivityLog("Sync'd live SQLite tables", "General");
    });
  }

  // 3. Quick templates copy-click for SQL Console
  document.querySelectorAll('.db-query-template').forEach(tpl => {
    tpl.addEventListener('click', (e) => {
      const sql = e.currentTarget.getAttribute('data-query');
      const sqlInput = document.getElementById('db-sql-input');
      if (sqlInput) {
        sqlInput.value = sql;
        const feedbackEl = document.getElementById('db-sql-feedback');
        if (feedbackEl) {
          feedbackEl.className = "text-[10px] font-semibold text-amber-500 font-mono";
          feedbackEl.innerText = "Template pre-filled!";
          setTimeout(() => {
            feedbackEl.innerText = "";
          }, 1500);
        }
      }
    });
  });

  // 4. SQL console direct query executor
  const dbSqlRunBtn = document.getElementById('db-sql-run-btn');
  if (dbSqlRunBtn) {
    dbSqlRunBtn.addEventListener('click', async () => {
      const sqlInput = document.getElementById('db-sql-input');
      const feedbackEl = document.getElementById('db-sql-feedback');
      const resultsContainer = document.getElementById('db-sql-results-container');
      const resultsHead = document.getElementById('db-sql-results-head');
      const resultsBody = document.getElementById('db-sql-results-body');
      const resultsMsg = document.getElementById('db-sql-results-message');

      if (!sqlInput || !feedbackEl) return;
      const queryText = sqlInput.value.trim();

      if (!queryText) {
        feedbackEl.className = "text-[10px] font-semibold text-rose-500 font-mono";
        feedbackEl.innerText = "Error: Query cannot be empty.";
        return;
      }

      feedbackEl.className = "text-[10px] font-semibold text-amber-500 font-mono animate-pulse";
      feedbackEl.innerText = "Executing query against tasks.db...";

      try {
        const res = await fetch('/api/db/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryText })
        });

        const data = await res.json();
        if (resultsContainer) resultsContainer.classList.remove('hidden');

        if (res.ok) {
          feedbackEl.className = "text-[10px] font-semibold text-emerald-500 font-mono";
          feedbackEl.innerText = `Success! Transaction completed.`;

          if (data.is_select) {
            if (resultsMsg) {
              resultsMsg.innerText = "";
              resultsMsg.classList.add('hidden');
            }

            // Draw headers
            if (resultsHead) {
              if (data.columns && data.columns.length > 0) {
                resultsHead.innerHTML = `
                  <tr>
                    ${data.columns.map(col => `<th class="p-2.5 capitalize">${col}</th>`).join('')}
                  </tr>
                `;
              } else {
                resultsHead.innerHTML = "";
              }
            }

            // Draw rows
            if (resultsBody) {
              if (data.rows && data.rows.length > 0) {
                resultsBody.innerHTML = data.rows.map(row => `
                  <tr class="hover:bg-neutral-100 dark:hover:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-850">
                    ${data.columns.map(col => `<td class="p-2.5 font-mono text-[10px] text-neutral-600 dark:text-neutral-300 max-w-xs truncate" title="${row[col]}">${escapeHTML(String(row[col] !== null ? row[col] : 'NULL'))}</td>`).join('')}
                  </tr>
                `).join('');
              } else {
                resultsBody.innerHTML = `<tr><td colspan="${(data.columns && data.columns.length) || 1}" class="p-4 text-center text-neutral-400 italic">Query succeeded, but returned 0 rows.</td></tr>`;
              }
            }
          } else {
            // Non-select statement
            if (resultsHead) resultsHead.innerHTML = "";
            if (resultsBody) resultsBody.innerHTML = "";
            if (resultsMsg) {
              resultsMsg.classList.remove('hidden');
              resultsMsg.innerHTML = `
                <div class="p-4 bg-emerald-50 dark:bg-emerald-950/15 border border-emerald-100 dark:border-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-xl text-center">
                  <p class="font-bold text-xs">${data.message}</p>
                </div>
              `;
            }
            // Also refresh database explorer schema contents
            renderDatabaseExplorer();
          }
        } else {
          feedbackEl.className = "text-[10px] font-semibold text-rose-500 font-mono";
          feedbackEl.innerText = "Error executing query.";
          if (resultsHead) resultsHead.innerHTML = "";
          if (resultsBody) resultsBody.innerHTML = "";
          if (resultsMsg) {
            resultsMsg.classList.remove('hidden');
            resultsMsg.innerHTML = `
              <div class="p-4 bg-rose-50 dark:bg-rose-950/15 border border-rose-100 dark:border-rose-950 text-rose-600 dark:text-rose-400 rounded-xl text-left font-mono text-[11px] whitespace-pre-wrap">
                <p class="font-bold">SQLite3 Error:</p>
                <p class="mt-1">${escapeHTML(data.detail || 'Unknown syntax error.')}</p>
              </div>
            `;
          }
        }
      } catch (err) {
        feedbackEl.className = "text-[10px] font-semibold text-rose-500 font-mono";
        feedbackEl.innerText = "Network connection failed.";
        console.error(err);
      }
    });
  }

  // Dashboard Clear logs trigger
  document.getElementById('activity-purge-btn').addEventListener('click', () => {
    activityLogs = [];
    localStorage.setItem(`organizo_logs_${currentUser.user_id}`, JSON.stringify([]));
    renderActivityList();
  });
}
