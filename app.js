let tasks = [];
let editingTaskId = null;
let showCritical = false;
let currentTaskType = 'fixed';
let midnightCheckInterval;
let stats = {
    completedOnTime: 0,
    deletedOrExpired: 0,
    totalFinished: 0
};

// Use a fixed storage key that works across all origins
const STORAGE_PREFIX = 'edf-scheduler-app-';
const TASKS_KEY = STORAGE_PREFIX + 'tasks-v4';
const STATS_KEY = STORAGE_PREFIX + 'stats-v4';

window.addEventListener('DOMContentLoaded', () => {
    loadTasks();
    loadStats();
    checkAndResetTasks();
    removeExpiredFixedTasks();
    updateCompletionScore();
    document.getElementById('loading').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';

    // Start midnight check
    startMidnightCheck();
});

function startMidnightCheck() {
    // Check every minute if it's past midnight
    midnightCheckInterval = setInterval(() => {
        const now = new Date();
        const lastCheck = localStorage.getItem('lastMidnightCheck');
        const today = now.toDateString();

        if (lastCheck !== today) {
            localStorage.setItem('lastMidnightCheck', today);
            checkAndResetTasks();
            removeExpiredFixedTasks();
        }
    }, 60000); // Check every minute
}

function loadTasks() {
    try {
        // Try to load from multiple possible storage keys (migration support)
        let savedTasks = localStorage.getItem(TASKS_KEY);

        // If not found, try old keys for migration
        if (!savedTasks) {
            const oldKeys = ['edf-tasks-v3', 'edf-tasks-v2', 'edf-tasks'];
            for (const oldKey of oldKeys) {
                savedTasks = localStorage.getItem(oldKey);
                if (savedTasks) {
                    console.log('Migrating from', oldKey, 'to', TASKS_KEY);
                    break;
                }
            }
        }

        if (savedTasks) {
            tasks = JSON.parse(savedTasks);
            // Save to current key to ensure consistency
            saveTasks();
            showSaveStatus('Data loaded');
        } else {
            console.log('No tasks found in storage');
        }
    } catch (error) {
        console.log('Error loading tasks:', error);
    }
    renderTasks();
}

function loadStats() {
    try {
        // Try to load from multiple possible storage keys (migration support)
        let savedStats = localStorage.getItem(STATS_KEY);

        // If not found, try old keys for migration
        if (!savedStats) {
            const oldKeys = ['edf-stats-v3', 'edf-stats-v2', 'edf-stats'];
            for (const oldKey of oldKeys) {
                savedStats = localStorage.getItem(oldKey);
                if (savedStats) {
                    console.log('Migrating stats from', oldKey, 'to', STATS_KEY);
                    break;
                }
            }
        }

        if (savedStats) {
            stats = JSON.parse(savedStats);
            // Save to current key to ensure consistency
            saveStats();
        }
    } catch (error) {
        console.log('Error loading stats:', error);
    }
}

function saveTasks() {
    try {
        localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
        showSaveStatus('Saved');
    } catch (error) {
        console.error('Failed to save:', error);
        showSaveStatus('Save failed');
    }
}

function saveStats() {
    try {
        localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (error) {
        console.error('Failed to save stats:', error);
    }
}

function updateCompletionScore() {
    const totalTasks = stats.totalFinished;
    const completedOnTime = stats.completedOnTime;

    const percentage = totalTasks > 0 ? Math.round((completedOnTime / totalTasks) * 100) : 0;

    // Update percentage display
    document.getElementById('scorePercentage').textContent = percentage + '%';

    // Update circle progress
    const circle = document.getElementById('scoreCircle');
    const circumference = 628.32;
    const offset = circumference - (percentage / 100) * circumference;
    circle.style.strokeDashoffset = offset;
}

function showSaveStatus(message) {
    const status = document.getElementById('saveStatus');
    status.textContent = message;
    status.style.display = 'inline-block';
    setTimeout(() => {
        status.style.display = 'none';
    }, 2000);
}

function selectTaskType(type) {
    currentTaskType = type;
    const fixedBtn = document.getElementById('fixedBtn');
    const recurringBtn = document.getElementById('recurringBtn');
    const deadlineGroup = document.getElementById('deadlineGroup');
    const recurrenceGroup = document.getElementById('recurrenceGroup');

    if (type === 'fixed') {
        fixedBtn.classList.add('active');
        recurringBtn.classList.remove('active');
        deadlineGroup.style.display = 'block';
        recurrenceGroup.style.display = 'none';
    } else {
        recurringBtn.classList.add('active');
        fixedBtn.classList.remove('active');
        deadlineGroup.style.display = 'none';
        recurrenceGroup.style.display = 'block';
    }
}

function removeExpiredFixedTasks() {
    const today = getTodayString();
    const initialLength = tasks.length;

    let expiredCount = 0;
    tasks = tasks.filter(task => {
        if (task.taskType === 'fixed' && task.deadline < today) {
            expiredCount++;
            return false; // Remove expired fixed task
        }
        return true;
    });

    if (expiredCount > 0) {
        // Track expired tasks
        stats.deletedOrExpired += expiredCount;
        stats.totalFinished += expiredCount;
        saveStats();
        updateCompletionScore();
    }

    if (tasks.length !== initialLength) {
        saveTasks();
        renderTasks();
    }
}

function checkAndResetTasks() {
    const today = getTodayString();
    let tasksModified = false;

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (task.taskType === 'recurring') {
            // Check if task's deadline has passed (it's time to show it again)
            if (task.completedToday) {
                const completedDate = new Date(task.completedToday);
                const deadlineDate = new Date(task.deadline);
                const todayDate = new Date(today);

                // If today is >= deadline, the task should reappear
                if (todayDate >= deadlineDate) {
                    delete task.completedToday;
                    tasksModified = true;
                }
            }

            // If deadline has passed and task is not completed today, update deadline
            const taskDate = task.deadline;
            if (taskDate < today && !task.completedToday) {
                // Calculate next deadline based on recurrence interval
                const nextDeadline = getNextRecurrenceDate(task.recurrenceInterval);
                task.deadline = nextDeadline;
                tasksModified = true;
            }
        }
    }

    if (tasksModified) {
        saveTasks();
        renderTasks();
    }
}

function getNextRecurrenceDate(interval) {
    const now = new Date();
    const next = new Date(now);

    switch (interval) {
        case 'daily':
            next.setDate(next.getDate() + 1);
            break;
        case 'weekly':
            next.setDate(next.getDate() + 7);
            break;
        case 'monthly':
            next.setMonth(next.getMonth() + 1);
            break;
    }

    return next.toISOString().split('T')[0];
}

function getTodayString() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

function toggleAddTask() {
    const form = document.getElementById('taskForm');
    if (form.classList.contains('hidden')) {
        form.classList.remove('hidden');
        editingTaskId = null;
        document.getElementById('formTitle').textContent = 'Add New Task';
        document.getElementById('submitBtn').textContent = 'Add Task';
        clearForm();
    } else {
        closeTaskForm();
    }
}

function closeTaskForm() {
    document.getElementById('taskForm').classList.add('hidden');
    clearForm();
    editingTaskId = null;
}

function clearForm() {
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDescription').value = '';
    document.getElementById('taskDeadline').value = '';
    document.getElementById('recurrenceInterval').value = 'daily';
    currentTaskType = 'fixed';
    selectTaskType('fixed');
}

function saveTask() {
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();

    if (!title) {
        alert('Please enter a task title');
        return;
    }

    let deadline;
    let recurrenceInterval = null;

    if (currentTaskType === 'fixed') {
        deadline = document.getElementById('taskDeadline').value;
        if (!deadline) {
            alert('Please select a deadline');
            return;
        }
    } else {
        recurrenceInterval = document.getElementById('recurrenceInterval').value;
        deadline = getNextRecurrenceDate(recurrenceInterval);
    }

    if (editingTaskId) {
        const index = tasks.findIndex(t => t.id === editingTaskId);
        if (index !== -1) {
            tasks[index] = {
                ...tasks[index],
                title,
                description,
                deadline,
                taskType: currentTaskType,
                recurrenceInterval: currentTaskType === 'recurring' ? recurrenceInterval : null
            };
        }
    } else {
        const task = {
            id: Date.now(),
            title,
            description,
            deadline,
            completed: false,
            taskType: currentTaskType,
            recurrenceInterval: currentTaskType === 'recurring' ? recurrenceInterval : null,
            createdAt: new Date().toISOString()
        };
        tasks.push(task);
    }

    saveTasks();
    closeTaskForm();
    renderTasks();
}

function editTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    editingTaskId = id;
    currentTaskType = task.taskType || 'fixed';
    selectTaskType(currentTaskType);

    document.getElementById('formTitle').textContent = 'Edit Task';
    document.getElementById('submitBtn').textContent = 'Update Task';
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description;

    if (task.taskType === 'fixed') {
        document.getElementById('taskDeadline').value = task.deadline;
    } else {
        document.getElementById('recurrenceInterval').value = task.recurrenceInterval || 'daily';
    }

    document.getElementById('taskForm').classList.remove('hidden');
}

function deleteTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const taskTypeText = task.taskType === 'recurring' ? 'recurring task' : 'task';
    const confirmMsg = task.taskType === 'recurring' ?
        `Delete this recurring task permanently? It will NOT reappear after deletion.` :
        `Are you sure you want to delete this task?`;

    if (confirm(confirmMsg)) {
        // Track as deleted/removed
        stats.deletedOrExpired++;
        stats.totalFinished++;

        // Permanently remove task (both fixed and recurring)
        tasks = tasks.filter(t => t.id !== id);
        saveTasks();
        saveStats();
        updateCompletionScore();
        renderTasks();
        showSaveStatus(`${task.taskType === 'recurring' ? 'Recurring task' : 'Task'} permanently deleted!`);
    }
}

function completeTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (task.taskType === 'recurring') {
        // Track recurring task completion
        const isOnTime = new Date(task.deadline) >= new Date(getTodayString());
        if (isOnTime) {
            stats.completedOnTime++;
        } else {
            stats.deletedOrExpired++;
        }
        stats.totalFinished++;

        // Mark as completed today - task will be hidden until next recurrence
        task.completedToday = getTodayString();

        // Calculate next deadline based on recurrence interval
        const nextDeadline = getNextRecurrenceDate(task.recurrenceInterval);
        task.deadline = nextDeadline;

        const intervalText = task.recurrenceInterval === 'daily' ? 'tomorrow' :
            task.recurrenceInterval === 'weekly' ? 'next week' : 'next month';
        showSaveStatus(`Task completed! Will reappear ${intervalText}.`);
    } else {
        // Track fixed task completion
        const isOnTime = new Date(task.deadline) >= new Date(getTodayString());
        if (isOnTime) {
            stats.completedOnTime++;
        } else {
            stats.deletedOrExpired++;
        }
        stats.totalFinished++;

        // Remove fixed task
        tasks = tasks.filter(t => t.id !== id);
        showSaveStatus('Task completed and removed!');
    }

    saveTasks();
    saveStats();
    updateCompletionScore();
    renderTasks();
}

function toggleCritical() {
    showCritical = !showCritical;
    renderTasks();
}

function getDaysUntilDeadline(deadline) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0);
    const diffTime = deadlineDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function getUrgencyBadge(deadline) {
    const days = getDaysUntilDeadline(deadline);
    if (days < 0) return {
        class: 'overdue',
        text: 'Overdue by ' + Math.abs(days) + ' days'
    };
    if (days === 0) return {
        class: 'urgent',
        text: 'DUE TODAY'
    };
    if (days <= 2) return {
        class: 'warning',
        text: days + ' days left'
    };
    if (days <= 7) return {
        class: 'caution',
        text: days + ' days left'
    };
    return {
        class: 'safe',
        text: days + ' days left'
    };
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderTasks() {
    const today = getTodayString();
    // Filter out completed tasks and recurring tasks completed today
    const activeTasks = tasks.filter(t => {
        if (t.completed) return false;
        // Hide recurring tasks that were completed today
        if (t.taskType === 'recurring' && t.completedToday === today) return false;
        return true;
    });

    // Separate fixed and recurring tasks
    const fixedTasks = activeTasks.filter(t => t.taskType === 'fixed');
    const recurringTasks = activeTasks.filter(t => t.taskType === 'recurring');

    // Apply EDF (Earliest Deadline First) to each type separately
    const sortedFixedTasks = fixedTasks.sort((a, b) => {
        const deadlineDiff = new Date(a.deadline) - new Date(b.deadline);
        if (deadlineDiff !== 0) return deadlineDiff;
        return a.id - b.id;
    });

    const sortedRecurringTasks = recurringTasks.sort((a, b) => {
        const deadlineDiff = new Date(a.deadline) - new Date(b.deadline);
        if (deadlineDiff !== 0) return deadlineDiff;
        return a.id - b.id;
    });

    // Identify critical tasks (deadline < 3 days) from both types
    const criticalTasks = activeTasks.filter(t => getDaysUntilDeadline(t.deadline) < 3)
        .sort((a, b) => {
            const deadlineDiff = new Date(a.deadline) - new Date(b.deadline);
            if (deadlineDiff !== 0) return deadlineDiff;
            return a.id - b.id;
        });

    // Update stats
    document.getElementById('fixedCount').textContent = fixedTasks.length;
    document.getElementById('recurringCount').textContent = recurringTasks.length;
    document.getElementById('criticalCount').textContent = criticalTasks.length;

    // Render critical section
    const criticalSection = document.getElementById('criticalSection');
    if (showCritical && criticalTasks.length > 0) {
        criticalSection.style.display = 'block';
        renderTaskList('criticalList', criticalTasks, true);
    } else {
        criticalSection.style.display = 'none';
    }

    // Render fixed tasks
    renderTaskList('fixedTaskList', sortedFixedTasks, false);

    // Render recurring tasks
    renderTaskList('recurringTaskList', sortedRecurringTasks, false);
}

function renderTaskList(containerId, tasksList, isCritical) {
    const container = document.getElementById(containerId);

    if (tasksList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-text">No tasks yet</div>
                <div class="empty-subtext">Add a new task to get started</div>
            </div>
        `;
        return;
    }

    container.innerHTML = tasksList.map((task, index) => {
                const urgency = getUrgencyBadge(task.deadline);
                const isCriticalTask = getDaysUntilDeadline(task.deadline) < 3;
                const taskTypeLabel = task.taskType === 'recurring' ? 'Recurring (' + (task.recurrenceInterval || 'daily') + ')' : 'Fixed Deadline';
                const taskTypeBadge = task.taskType === 'recurring' ? 'recurring-type' : 'fixed-type';

                return `
            <div class="task-item ${isCriticalTask ? 'critical' : ''}">
                <div class="task-content">
                    <div class="task-number ${isCriticalTask ? 'critical' : task.taskType === 'recurring' ? 'recurring' : ''}">
                        ${index + 1}
                    </div>
                    <div class="task-details">
                        <div class="task-header">
                            <h3 class="task-title">${escapeHtml(task.title)}</h3>
                            <div class="task-actions">
                                <button class="btn-icon complete" onclick="completeTask(${task.id})" title="${task.taskType === 'recurring' ? 'Complete & reset' : 'Complete & remove'}">
                                    Complete
                                </button>
                                <button class="btn-icon" onclick="editTask(${task.id})" title="Edit">
                                    Edit
                                </button>
                                <button class="btn-icon delete" onclick="deleteTask(${task.id})" title="Delete">
                                    Delete
                                </button>
                            </div>
                        </div>
                        ${task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : ''}
                        <div class="task-meta">
                            <span class="badge ${urgency.class}">
                                ${urgency.text}
                            </span>
                            <span class="badge info">
                                ${formatDate(task.deadline)}
                            </span>
                            <span class="badge ${taskTypeBadge}">
                                ${taskTypeLabel}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function exportData() {
    try {
        const exportData = {
            tasks: tasks,
            stats: stats,
            exportDate: new Date().toISOString(),
            version: 'v4'
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'edf-scheduler-backup-' + new Date().toISOString().split('T')[0] + '.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showSaveStatus('Data exported successfully!');
    } catch (error) {
        alert('Export failed: ' + error.message);
    }
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importData = JSON.parse(event.target.result);
                
                if (importData.tasks) {
                    const confirmMsg = 'This will replace your current data with ' + 
                        importData.tasks.length + ' tasks. Continue?';
                    
                    if (confirm(confirmMsg)) {
                        tasks = importData.tasks || [];
                        stats = importData.stats || {
                            completedOnTime: 0,
                            deletedOrExpired: 0,
                            totalFinished: 0
                        };
                        
                        saveTasks();
                        saveStats();
                        updateCompletionScore();
                        renderTasks();
                        showSaveStatus('Data imported successfully!');
                    }
                } else {
                    alert('Invalid backup file format');
                }
            } catch (error) {
                alert('Import failed: ' + error.message);
            }
        };
        reader.readAsText(file);
    };
    
    input.click();
}

function resetCompletionStats() {
    if (confirm('Are you sure you want to reset all completion statistics? This will reset your on-time completion rate to 0%.')) {
        stats = {
            completedOnTime: 0,
            deletedOrExpired: 0,
            totalFinished: 0
        };
        saveStats();
        updateCompletionScore();
        showSaveStatus('Completion statistics reset!');
    }
}