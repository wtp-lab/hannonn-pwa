
// --- State ---
const STATE_KEY = 'hanon_app_state';

let state = {
    currentGroupId: null,
    currentStepIndex: 0, // 0-based index within the group
    totalSessions: 0,
    hasSeenCurrentAnswer: false
};

// --- Audio ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const sounds = {
    // Gentle ping for showing answer
    playShow: () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    },
    // Soft click/thud for next
    playNext: () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    }
};

let questions = []; // Raw CSV data parsed
let currentGroupQuestions = []; // Filtered for current group

// --- DOM Layout ---
const ui = {
    baseEn: document.getElementById('base-en'),
    baseJa: document.getElementById('base-ja'),
    instruction: document.getElementById('instruction'),
    answerBox: document.getElementById('answer-box'),
    answerEn: document.getElementById('answer-en'),
    totalSessions: document.getElementById('total-sessions'),
    btnShow: document.getElementById('btn-show-answer'),
    btnNext: document.getElementById('btn-next'),
    loadingMsg: document.getElementById('loading-message'),
    // Session UI
    btnOneSessionList: document.getElementById('btn-session-list'),
    sessionModal: document.getElementById('session-modal'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    sessionListContainer: document.getElementById('session-list')
};

// --- Initialization ---
async function init() {
    loadState();

    try {
        await loadQuestions();
    } catch (e) {
        console.error("Failed to load questions", e);
        alert("Failed to load questions.csv. Please check the file.");
        return;
    }

    if (questions.length === 0) {
        alert("No questions found in CSV.");
        return;
    }

    // Initialize or Validate State
    if (!state.currentGroupId) {
        state.currentGroupId = questions[0].group_id;
        state.currentStepIndex = 0;
    }

    updateCurrentGroupData();

    if (currentGroupQuestions.length === 0) {
        resetToFirstGroup();
    }

    render();
    setupEventListeners();
}

// --- Data Loading ---
async function loadQuestions() {
    // Cache busting: append timestamp to URL
    const response = await fetch(`questions.csv?t=${Date.now()}`);
    const text = await response.text();
    questions = parseCSV(text);
}

function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        // Handle simple CSV splitting (assuming no commas in fields for MVP)
        const values = line.split(',');

        const entry = {};
        headers.forEach((h, index) => {
            entry[h] = values[index] ? values[index].trim() : '';
        });

        data.push(entry);
    }
    return data;
}

// --- Logic ---

function loadState() {
    const stored = localStorage.getItem(STATE_KEY);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            state = { ...state, ...parsed };
        } catch (e) {
            console.warn("Invalid state, resetting.");
        }
    }
}

function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function updateCurrentGroupData() {
    // Filter questions by currentGroupId and sort by step_no
    currentGroupQuestions = questions.filter(q => q.group_id === state.currentGroupId);
    currentGroupQuestions.sort((a, b) => parseInt(a.step_no) - parseInt(b.step_no));
}

function resetToFirstGroup() {
    if (questions.length > 0) {
        state.currentGroupId = questions[0].group_id;
        state.currentStepIndex = 0;
        updateCurrentGroupData();
        saveState();
    }
}

function getCurrentQuestion() {
    if (!currentGroupQuestions || currentGroupQuestions.length === 0) return null;
    if (state.currentStepIndex >= currentGroupQuestions.length) {
        return null;
    }
    return currentGroupQuestions[state.currentStepIndex];
}

function handleNext() {
    sounds.playNext();
    state.currentStepIndex++;
    state.hasSeenCurrentAnswer = false;

    if (state.currentStepIndex >= currentGroupQuestions.length) {
        completeSession();
    } else {
        saveState();
        render();
    }
}

function completeSession() {
    state.totalSessions++;

    const uniqueGroups = getUniqueGroups();
    const currentGroupObj = uniqueGroups.find(g => g.id === state.currentGroupId);
    const currentIndex = uniqueGroups.indexOf(currentGroupObj);

    let nextGroupId;
    if (currentIndex === -1 || currentIndex === uniqueGroups.length - 1) {
        nextGroupId = uniqueGroups[0].id; // Loop
    } else {
        nextGroupId = uniqueGroups[currentIndex + 1].id;
    }

    state.currentGroupId = nextGroupId;
    state.currentStepIndex = 0;

    updateCurrentGroupData();
    saveState();
    render();
}

function toggleAnswer() {
    sounds.playShow();
    const box = ui.answerBox;
    if (box.classList.contains('hidden')) {
        box.classList.remove('hidden');
        state.hasSeenCurrentAnswer = true;
    }
}

function getUniqueGroups() {
    const groups = [];
    const seen = new Set();
    questions.forEach(q => {
        if (!seen.has(q.group_id)) {
            seen.add(q.group_id);
            groups.push({
                id: q.group_id,
                title: q.group_title || `Session ${q.group_id}`
            });
        }
    });
    return groups;
}

// --- UI Actions ---
function openSessionModal() {
    const groups = getUniqueGroups();
    ui.sessionListContainer.innerHTML = '';

    groups.forEach((g, idx) => {
        const item = document.createElement('button');
        item.className = 'session-item';
        if (g.id === state.currentGroupId) item.classList.add('active');
        item.textContent = `${idx + 1}. ${g.title}`;
        item.onclick = () => selectSession(g.id);
        ui.sessionListContainer.appendChild(item);
    });

    ui.sessionModal.classList.remove('hidden');
}

function closeSessionModal() {
    ui.sessionModal.classList.add('hidden');
}

function selectSession(groupId) {
    state.currentGroupId = groupId;
    state.currentStepIndex = 0;
    state.hasSeenCurrentAnswer = false;
    updateCurrentGroupData();
    saveState();
    render();
    closeSessionModal();
}

// --- Rendering ---
function render() {
    const q = getCurrentQuestion();

    ui.totalSessions.textContent = state.totalSessions;

    const groups = getUniqueGroups();
    const currentGroupObj = groups.find(g => g.id === state.currentGroupId);
    const currentGroupIdx = groups.indexOf(currentGroupObj) + 1;
    const totalGroups = groups.length;

    const progressEl = document.getElementById('current-session-display');
    if (progressEl) {
        progressEl.textContent = `${currentGroupIdx} / ${totalGroups}`;
    }

    // Update button text
    if (ui.btnOneSessionList && currentGroupObj) {
        ui.btnOneSessionList.textContent = `${currentGroupObj.title} ▾`;
    }

    if (!q) {
        ui.baseEn.textContent = "No data available";
        return;
    }

    ui.baseEn.textContent = q.base_en;
    ui.baseJa.textContent = q.base_ja;
    ui.instruction.textContent = q.instruction;
    ui.answerEn.textContent = q.answer_en;

    ui.answerBox.classList.add('hidden');
}

function setupEventListeners() {
    ui.btnShow.addEventListener('click', toggleAnswer);
    ui.btnNext.addEventListener('click', handleNext);

    if (ui.btnOneSessionList) {
        ui.btnOneSessionList.addEventListener('click', openSessionModal);
    }
    if (ui.btnCloseModal) {
        ui.btnCloseModal.addEventListener('click', closeSessionModal);
    }
    if (ui.sessionModal) {
        ui.sessionModal.addEventListener('click', (e) => {
            if (e.target === ui.sessionModal) closeSessionModal();
        });
    }
}

// Start
init();
