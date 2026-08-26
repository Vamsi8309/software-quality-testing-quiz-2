// Game 1: Software Quality & Testing — Questions 1-5 from MCQs_5_Concepts
const QUESTIONS = [
  {
    q: "What is Selenium Manager mainly designed to automate?",
    options: [
      "Browser-driver discovery and management",
      "Parallel test execution across nodes",
      "Test-report creation and publishing",
      "UI locator identification and maintenance"
    ],
    correct: 0
  },
  {
    q: "What is the main advantage of WebDriver BiDi?",
    options: [
      "It records browser actions for later playback",
      "It enables two-way, event-driven browser communication",
      "It compares screenshots across multiple browsers",
      "It automatically converts manual tests into scripts"
    ],
    correct: 1
  },
  {
    q: "What does API contract testing verify?",
    options: [
      "API response times remain below a fixed limit",
      "Consumers and providers follow an agreed interface",
      "API traffic is distributed equally across servers",
      "Every endpoint uses the same authentication method"
    ],
    correct: 1
  },
  {
    q: "A test passes and fails on the same build without a code change. What is it called?",
    options: [
      "Regression test",
      "Flaky test",
      "Blocked test",
      "Deprecated test"
    ],
    correct: 1
  },
  {
    q: "Which activity best represents shift-left testing?",
    options: [
      "Testing only after deployment to production",
      "Involving QA during requirements and development",
      "Moving performance testing to the final release",
      "Executing all test cases after user acceptance testing"
    ],
    correct: 1
  }
];

const TIME_PER_QUESTION = 20;
const LEADERBOARD_KEY = "softwareQualityTestingLeaderboard";
const PLAYED_EMPLOYEES_KEY = "softwareQualityTestingPlayedEmployees";
const ADMIN_PIN = "2003";
const LEADERBOARD_LIMIT = 10;
const POINTS_PER_QUESTION = Math.floor(100 / QUESTIONS.length);
const EMPLOYEE_ID_PATTERN = /^\d{6,7}$/;

let currentIndex = 0;
let score = 0;
let playerName = "";
let employeeId = "";
let timer = null;
let timeLeft = TIME_PER_QUESTION;
let answers = []; // { correct: bool, timeTaken: number }
let questionStart = 0;

const startScreen = document.getElementById("start-screen");
const quizScreen = document.getElementById("quiz-screen");
const resultScreen = document.getElementById("result-screen");

const nameInput = document.getElementById("player-name");
const employeeIdInput = document.getElementById("employee-id");
const startError = document.getElementById("start-error");
const startBtn = document.getElementById("start-btn");
const nextBtn = document.getElementById("next-btn");
const restartBtn = document.getElementById("restart-btn");
const adminViewBtn = document.getElementById("admin-view-btn");
const adminModal = document.getElementById("admin-modal");
const adminCloseBtn = document.getElementById("admin-close-btn");
const adminLogin = document.getElementById("admin-login");
const adminPinInput = document.getElementById("admin-pin");
const adminError = document.getElementById("admin-error");
const adminLoginBtn = document.getElementById("admin-login-btn");
const adminContent = document.getElementById("admin-content");
const adminLockBtn = document.getElementById("admin-lock-btn");
const adminRecordsList = document.getElementById("admin-records-list");

const qCounter = document.getElementById("q-counter");
const progressFill = document.getElementById("progress-fill");
const questionText = document.getElementById("question-text");
const optionsList = document.getElementById("options-list");
const feedbackText = document.getElementById("feedback-text");
const liveScore = document.getElementById("live-score");
const timerText = document.getElementById("timer-text");
const ringProgress = document.getElementById("ring-progress");

function showScreen(el) {
  [startScreen, quizScreen, resultScreen].forEach(s => s.classList.remove("active"));
  el.classList.add("active");
}

function normalizeEmployeeId(value) {
  return value.trim().toLowerCase();
}

function getPlayedEmployeeIds() {
  let savedIds = [];
  try {
    const parsedIds = JSON.parse(localStorage.getItem(PLAYED_EMPLOYEES_KEY) || "[]");
    if (Array.isArray(parsedIds)) savedIds = parsedIds;
  } catch {
    savedIds = [];
  }

  const leaderboardIds = getLeaderboard()
    .map(entry => entry.employeeId)
    .filter(id => typeof id === "string" && id !== "Not provided")
    .map(normalizeEmployeeId);

  return [...new Set([...savedIds, ...leaderboardIds].map(normalizeEmployeeId))];
}

function markEmployeeAsPlayed(id) {
  const normalizedId = normalizeEmployeeId(id);
  const playedIds = getPlayedEmployeeIds();
  if (!playedIds.includes(normalizedId)) playedIds.push(normalizedId);

  try {
    localStorage.setItem(PLAYED_EMPLOYEES_KEY, JSON.stringify(playedIds));
    return true;
  } catch {
    return false;
  }
}
startBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const enteredEmployeeId = employeeIdInput.value.trim();
  startError.textContent = "";

  if (!enteredEmployeeId) {
    startError.textContent = "Enter your Employee ID to start the game.";
    employeeIdInput.focus();
    return;
  }

  if (!EMPLOYEE_ID_PATTERN.test(enteredEmployeeId)) {
    startError.textContent = "Employee ID must contain exactly 6 or 7 digits.";
    employeeIdInput.focus();
    return;
  }

  if (getPlayedEmployeeIds().includes(normalizeEmployeeId(enteredEmployeeId))) {
    startError.textContent = "This Employee ID has already played. Each employee can play only once.";
    employeeIdInput.focus();
    return;
  }

  if (!markEmployeeAsPlayed(enteredEmployeeId)) {
    startError.textContent = "The game cannot verify this attempt. Enable browser storage and try again.";
    return;
  }

  playerName = name || "Player";
  employeeId = enteredEmployeeId;
  currentIndex = 0;
  score = 0;
  answers = [];
  liveScore.textContent = "0";
  showScreen(quizScreen);
  loadQuestion();
});

[nameInput, employeeIdInput].forEach(input => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startBtn.click();
  });
});

employeeIdInput.addEventListener("input", () => {
  employeeIdInput.value = employeeIdInput.value.replace(/\D/g, "").slice(0, 7);
});

function loadQuestion() {
  const item = QUESTIONS[currentIndex];
  qCounter.textContent = `Question ${currentIndex + 1} / ${QUESTIONS.length}`;
  progressFill.style.width = `${((currentIndex) / QUESTIONS.length) * 100}%`;
  questionText.textContent = item.q;
  feedbackText.textContent = "";
  feedbackText.className = "feedback";
  nextBtn.disabled = true;
  nextBtn.textContent = currentIndex === QUESTIONS.length - 1 ? "See Results" : "Next";

  optionsList.innerHTML = "";
  const letters = ["A", "B", "C", "D"];
  item.options.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.innerHTML = `<span class="opt-letter">${letters[idx]}</span><span>${opt}</span>`;
    btn.addEventListener("click", () => selectOption(idx));
    optionsList.appendChild(btn);
  });

  startTimer();
  questionStart = Date.now();
}

function startTimer() {
  clearInterval(timer);
  timeLeft = TIME_PER_QUESTION;
  updateTimerUI();
  timer = setInterval(() => {
    timeLeft--;
    updateTimerUI();
    if (timeLeft <= 0) {
      clearInterval(timer);
      selectOption(-1); // time's up, no answer selected
    }
  }, 1000);
}

function updateTimerUI() {
  timerText.textContent = timeLeft;
  const pct = (timeLeft / TIME_PER_QUESTION) * 100;
  ringProgress.style.strokeDashoffset = 100 - pct;
  ringProgress.style.stroke = timeLeft <= 5 ? "#EF4444" : "#00B2A9";
}

function selectOption(selectedIdx) {
  clearInterval(timer);
  const item = QUESTIONS[currentIndex];
  const buttons = optionsList.querySelectorAll(".option-btn");
  const isCorrect = selectedIdx === item.correct;
  const timeTaken = Math.round((Date.now() - questionStart) / 1000);

  buttons.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === item.correct) {
      btn.classList.add("correct");
      addAnswerIcon(btn, "✅", "Correct answer");
    } else if (idx === selectedIdx) {
      btn.classList.add("wrong");
      addAnswerIcon(btn, "❌", "Wrong answer");
    }
  });

  if (isCorrect) {
    score += POINTS_PER_QUESTION;
    liveScore.textContent = score;
    showAnswerFeedback("✅", "Correct!", "correct");
  } else if (selectedIdx === -1) {
    showAnswerFeedback("⏰", "Time's up!", "wrong");
  } else {
    showAnswerFeedback("❌", "Not quite.", "wrong");
  }

  answers.push({ correct: isCorrect, timeTaken });
  progressFill.style.width = `${((currentIndex + 1) / QUESTIONS.length) * 100}%`;
  nextBtn.disabled = false;
}

function addAnswerIcon(button, symbol, label) {
  const icon = document.createElement("span");
  icon.className = "answer-icon";
  icon.setAttribute("aria-label", label);
  icon.textContent = symbol;
  button.appendChild(icon);
}

function showAnswerFeedback(symbol, message, state) {
  feedbackText.className = `feedback ${state}`;
  feedbackText.replaceChildren();

  const icon = document.createElement("span");
  icon.className = "feedback-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = symbol;

  const text = document.createElement("span");
  text.textContent = message;

  feedbackText.append(icon, text);
}

nextBtn.addEventListener("click", () => {
  currentIndex++;
  if (currentIndex < QUESTIONS.length) {
    loadQuestion();
  } else {
    showResults();
  }
});

function renderAdminRecords() {
  const entries = getLeaderboard();
  adminRecordsList.innerHTML = "";

  if (entries.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.className = "admin-empty";
    const emptyCell = document.createElement("td");
    emptyCell.colSpan = 6;
    emptyCell.textContent = "No leaderboard results yet.";
    emptyRow.appendChild(emptyCell);
    adminRecordsList.appendChild(emptyRow);
    return;
  }

  const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
  entries.forEach((entry, index) => {
    const row = document.createElement("tr");
    const values = [
      medals[index] || String(index + 1),
      entry.name,
      entry.employeeId || "\u2014",
      `${entry.score}`,
      `${entry.correct}/${QUESTIONS.length}`,
      `${entry.avgTime}s`
    ];

    values.forEach(value => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });

    adminRecordsList.appendChild(row);
  });
}

function showAdminLogin() {
  adminLogin.hidden = false;
  adminContent.hidden = true;
  adminPinInput.value = "";
  adminError.textContent = "";
  adminPinInput.focus();
}

function openAdminView() {
  adminModal.hidden = false;
  showAdminLogin();
}

function closeAdminView() {
  adminModal.hidden = true;
  adminPinInput.value = "";
  adminError.textContent = "";
}

function unlockAdminView() {
  if (adminPinInput.value !== ADMIN_PIN) {
    adminError.textContent = "Incorrect Admin PIN.";
    adminPinInput.select();
    return;
  }

  adminError.textContent = "";
  adminLogin.hidden = true;
  adminContent.hidden = false;
  renderAdminRecords();
}
function getLeaderboard() {
  try {
    const savedEntries = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || "[]");
    return Array.isArray(savedEntries)
      ? savedEntries.filter(entry =>
          typeof entry.name === "string" &&
          Number.isFinite(entry.score) &&
          Number.isFinite(entry.correct) &&
          Number.isFinite(entry.avgTime)
        )
      : [];
  } catch {
    return [];
  }
}

function addLeaderboardEntry(correctCount, avgTime) {
  const newEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: playerName,
    employeeId,
    score,
    correct: correctCount,
    avgTime,
    playedAt: Date.now()
  };

  const entries = getLeaderboard();
  entries.push(newEntry);
  entries.sort((a, b) =>
    b.score - a.score ||
    a.avgTime - b.avgTime ||
    (a.playedAt || 0) - (b.playedAt || 0)
  );

  const topEntries = entries.slice(0, LEADERBOARD_LIMIT);
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(topEntries));
  } catch {
    // The current results still display if browser storage is unavailable.
  }
}
function showResults() {
  showScreen(resultScreen);
  const correctCount = answers.filter(a => a.correct).length;
  const wrongCount = answers.length - correctCount;
  const avgTime = Math.round(answers.reduce((s, a) => s + a.timeTaken, 0) / answers.length);

  const resultComment = score >= 80
    ? `Outstanding work! You have a strong command of QA concepts.`
    : score >= 60
      ? `Nice work! You are making great progress.`
      : score >= 40
        ? `Good effort! Keep building your QA knowledge.`
        : `Keep practicing! Review the answers and try again.`;

  document.getElementById("result-player").textContent = resultComment;
  document.getElementById("final-score").textContent = score;
  document.getElementById("stat-correct").textContent = correctCount;
  document.getElementById("stat-wrong").textContent = wrongCount;
  document.getElementById("stat-time").textContent = `${avgTime}s`;

  addLeaderboardEntry(correctCount, avgTime);

  const emojiEl = document.getElementById("result-emoji");
  const titleEl = document.getElementById("result-title");
  const badgeEl = document.getElementById("result-badge");

  if (score >= 80) {
    emojiEl.textContent = "🏆";
    titleEl.textContent = "Champion!";
    badgeEl.textContent = "🥇 Champion Badge";
    badgeEl.className = "badge gold";
  } else if (score >= 60) {
    emojiEl.textContent = "🎉";
    titleEl.textContent = "Well Done!";
    badgeEl.textContent = "🥈 Silver Badge";
    badgeEl.className = "badge silver";
  } else {
    emojiEl.textContent = "💡";
    titleEl.textContent = "Keep Learning!";
    badgeEl.textContent = "🥉 Bronze Badge";
    badgeEl.className = "badge bronze";
  }

  const reviewList = document.getElementById("review-list");
  reviewList.innerHTML = "";
  QUESTIONS.forEach((item, idx) => {
    const a = answers[idx];
    const div = document.createElement("div");
    div.className = `review-item ${a.correct ? "ok" : "bad"}`;
    div.innerHTML = `<div class="rq">Q${idx + 1}. ${item.q}</div>
      <div class="ra">Correct answer: ${item.options[item.correct]} ${a.correct ? "— you got it right ✅" : "— you missed this ❌"}</div>`;
    reviewList.appendChild(div);
  });
}

restartBtn.addEventListener("click", () => {
  showScreen(startScreen);
  playerName = "";
  employeeId = "";
  nameInput.value = "";
  employeeIdInput.value = "";
  startError.textContent = "";
  nameInput.focus();
});
adminViewBtn.addEventListener("click", openAdminView);
adminCloseBtn.addEventListener("click", closeAdminView);
adminLoginBtn.addEventListener("click", unlockAdminView);
adminLockBtn.addEventListener("click", showAdminLogin);
adminPinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlockAdminView();
});
adminModal.addEventListener("click", (e) => {
  if (e.target === adminModal) closeAdminView();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !adminModal.hidden) closeAdminView();
});
