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
const POINTS_PER_QUESTION = Math.floor(100 / QUESTIONS.length);
const EMPLOYEE_ID_PATTERN = /^\d{6,7}$/;
const SUPABASE_URL = (window.QUIZ_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = window.QUIZ_SUPABASE_ANON_KEY || "";
const SUPABASE_CONFIGURED = /^https:\/\/.+/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;

const OFFLINE_MESSAGE = "The shared leaderboard is temporarily unavailable.";
const UNCONFIGURED_MESSAGE = "The shared leaderboard is not connected yet. Ask the admin to finish the Supabase setup.";

let currentIndex = 0;
let score = 0;
let playerName = "";
let employeeId = "";
let timer = null;
let timeLeft = TIME_PER_QUESTION;
let answers = []; // { correct: bool, timeTaken: number }
let questionStart = 0;
let adminPin = "";

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
const adminClearBtn = document.getElementById("admin-clear-btn");
const adminEmployeeIdInput = document.getElementById("admin-employee-id");
const adminRemovePlayerBtn = document.getElementById("admin-remove-player-btn");
const adminStatus = document.getElementById("admin-status");
const adminRecordsList = document.getElementById("admin-records-list");
const resultSaveStatus = document.getElementById("result-save-status");

const qCounter = document.getElementById("q-counter");
const progressFill = document.getElementById("progress-fill");
const questionText = document.getElementById("question-text");
const optionsList = document.getElementById("options-list");
const feedbackText = document.getElementById("feedback-text");
const answerReaction = document.getElementById("answer-reaction");
const liveScore = document.getElementById("live-score");
const timerText = document.getElementById("timer-text");
const ringProgress = document.getElementById("ring-progress");

function showScreen(el) {
  [startScreen, quizScreen, resultScreen].forEach(s => s.classList.remove("active"));
  el.classList.add("active");
}

function normalizeEmployeeId(value) {
  return value.trim();
}

class QuizError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// Every database call goes through one of the SECURITY DEFINER functions in
// supabase/schema.sql. The anon key below cannot read or write the tables
// directly, so admin actions stay PIN-guarded inside the database.
async function callDatabase(fn, args = {}) {
  if (!SUPABASE_CONFIGURED) {
    throw new QuizError(UNCONFIGURED_MESSAGE, "unconfigured");
  }

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(args)
    });
  } catch {
    throw new QuizError(OFFLINE_MESSAGE, "offline");
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = payload && (payload.message || payload.hint);
    throw new QuizError(detail || OFFLINE_MESSAGE, "request_failed");
  }
  return payload;
}

// The admin RPCs answer with { ok: false, error: "..." } instead of an HTTP
// error, so unwrap that into a QuizError the callers can branch on.
function unwrap(payload) {
  if (!payload || typeof payload !== "object") {
    throw new QuizError(OFFLINE_MESSAGE, "offline");
  }
  if (payload.ok) return payload;

  const messages = {
    bad_pin: "Incorrect Admin PIN.",
    pin_unset: "No Admin PIN is stored in the database yet. Run the \"Set the Admin PIN\" step from the README.",
    duplicate: "This Employee ID has already played.",
    not_found: "No player data was found for that Employee ID.",
    invalid_employee_id: "Employee ID must contain exactly 6 or 7 digits.",
    invalid_score: "That score could not be accepted."
  };
  throw new QuizError(messages[payload.error] || OFFLINE_MESSAGE, payload.error);
}

async function hasEmployeePlayed(id) {
  return Boolean(await callDatabase("player_has_played", { p_employee_id: id }));
}

startBtn.addEventListener("click", async () => {
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

  startBtn.disabled = true;
  startBtn.textContent = "Checking...";
  try {
    if (await hasEmployeePlayed(normalizeEmployeeId(enteredEmployeeId))) {
      startError.textContent = "This Employee ID has already played. Each employee can play only once.";
      employeeIdInput.focus();
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
  } catch (error) {
    startError.textContent = error.message || "The shared leaderboard is temporarily unavailable.";
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = "Start Game";
  }
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
  answerReaction.textContent = "";
  answerReaction.className = "answer-reaction";
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
    showAnswerReaction("🎉 ✅ 😄", "Correct answer!", "correct");
  } else if (selectedIdx === -1) {
    showAnswerFeedback("⏰", "Time's up!", "wrong");
    showAnswerReaction("⏰ 😅", "Time's up!", "wrong");
  } else {
    showAnswerFeedback("❌", "Not quite.", "wrong");
    showAnswerReaction("😕 ❌ 💪", "Wrong answer — keep trying!", "wrong");
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

function showAnswerReaction(symbols, message, state) {
  answerReaction.replaceChildren();

  const emojiLine = document.createElement("span");
  emojiLine.className = "reaction-emojis";
  emojiLine.setAttribute("aria-hidden", "true");
  emojiLine.textContent = symbols;

  const reactionMessage = document.createElement("strong");
  reactionMessage.textContent = message;

  answerReaction.append(emojiLine, reactionMessage);
  answerReaction.className = `answer-reaction ${state} show`;
}

nextBtn.addEventListener("click", () => {
  currentIndex++;
  if (currentIndex < QUESTIONS.length) {
    loadQuestion();
  } else {
    showResults();
  }
});

function renderAdminRecords(entries) {
  adminRecordsList.innerHTML = "";
  adminClearBtn.disabled = entries.length === 0;

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

async function fetchAdminRecords() {
  const payload = unwrap(await callDatabase("admin_leaderboard", { p_pin: adminPin }));
  return Array.isArray(payload.entries) ? payload.entries : [];
}

function showAdminLogin() {
  adminPin = "";
  adminLogin.hidden = false;
  adminContent.hidden = true;
  adminPinInput.value = "";
  adminEmployeeIdInput.value = "";
  adminError.textContent = "";
  showAdminStatus("");
  adminPinInput.focus();
}

function openAdminView() {
  adminModal.hidden = false;
  showAdminLogin();
}

function closeAdminView() {
  adminPin = "";
  adminModal.hidden = true;
  adminPinInput.value = "";
  adminEmployeeIdInput.value = "";
  adminError.textContent = "";
  showAdminStatus("");
}

async function unlockAdminView() {
  const enteredPin = adminPinInput.value.trim();
  if (!enteredPin) {
    adminError.textContent = "Enter the Admin PIN.";
    adminPinInput.focus();
    return;
  }

  adminLoginBtn.disabled = true;
  adminLoginBtn.textContent = "Checking...";
  adminPin = enteredPin;
  try {
    const entries = await fetchAdminRecords();
    adminError.textContent = "";
    adminLogin.hidden = true;
    adminContent.hidden = false;
    adminEmployeeIdInput.value = "";
    renderAdminRecords(entries);
    showAdminStatus("Showing shared scores from all devices.");
  } catch (error) {
    adminPin = "";
    adminError.textContent = error.message || OFFLINE_MESSAGE;
    adminPinInput.select();
  } finally {
    adminLoginBtn.disabled = false;
    adminLoginBtn.textContent = "Unlock";
  }
}

async function clearLeaderboard() {
  const confirmed = window.confirm(
    "Clear all player scores from the shared leaderboard? Every employee will be able to play again."
  );
  if (!confirmed) return;

  adminClearBtn.disabled = true;
  try {
    unwrap(await callDatabase("admin_clear_scores", { p_pin: adminPin }));
    renderAdminRecords([]);
    showAdminStatus("All player data was cleared. Employees can play again.");
  } catch (error) {
    adminClearBtn.disabled = false;
    showAdminStatus(error.message || "Player data could not be cleared. Please try again.", true);
  }
}

async function removePlayer() {
  const employeeIdToRemove = normalizeEmployeeId(adminEmployeeIdInput.value);

  if (!EMPLOYEE_ID_PATTERN.test(employeeIdToRemove)) {
    showAdminStatus("Enter a valid 6 or 7 digit Employee ID.", true);
    adminEmployeeIdInput.focus();
    return;
  }

  const confirmed = window.confirm(
    `Remove all data for Employee ID ${employeeIdToRemove}? This employee will be able to play again.`
  );
  if (!confirmed) return;

  adminRemovePlayerBtn.disabled = true;
  try {
    unwrap(await callDatabase("admin_remove_player", {
      p_pin: adminPin,
      p_employee_id: employeeIdToRemove
    }));
    const entries = await fetchAdminRecords();
    adminEmployeeIdInput.value = "";
    renderAdminRecords(entries);
    showAdminStatus(`Employee ID ${employeeIdToRemove} was removed and can play again.`);
  } catch (error) {
    showAdminStatus(error.message || "The player could not be removed. Please try again.", true);
    adminEmployeeIdInput.focus();
  } finally {
    adminRemovePlayerBtn.disabled = false;
  }
}

function showAdminStatus(message, isError = false) {
  adminStatus.textContent = message;
  adminStatus.className = `admin-status${isError ? " error" : ""}`;
}

async function saveLeaderboardEntry(correctCount, avgTime) {
  resultSaveStatus.textContent = "Saving your score to the shared leaderboard...";
  resultSaveStatus.className = "result-save-status";
  try {
    unwrap(await callDatabase("submit_score", {
      p_employee_id: employeeId,
      p_name: playerName,
      p_correct: correctCount,
      p_avg_time: avgTime
    }));
    resultSaveStatus.textContent = "✅ Your score was saved to the shared leaderboard.";
    resultSaveStatus.className = "result-save-status success";
  } catch (error) {
    resultSaveStatus.textContent = error.code === "duplicate"
      ? "This Employee ID already has a saved score."
      : "Your score could not be saved. Please ask the admin to check the connection.";
    resultSaveStatus.className = "result-save-status error";
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

  saveLeaderboardEntry(correctCount, avgTime);

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
  resultSaveStatus.textContent = "";
  resultSaveStatus.className = "result-save-status";
  nameInput.focus();
});
adminViewBtn.addEventListener("click", openAdminView);
adminCloseBtn.addEventListener("click", closeAdminView);
adminLoginBtn.addEventListener("click", unlockAdminView);
adminClearBtn.addEventListener("click", clearLeaderboard);
adminRemovePlayerBtn.addEventListener("click", removePlayer);
adminLockBtn.addEventListener("click", showAdminLogin);
adminEmployeeIdInput.addEventListener("input", () => {
  adminEmployeeIdInput.value = adminEmployeeIdInput.value.replace(/\D/g, "").slice(0, 7);
  showAdminStatus("");
});
adminEmployeeIdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") removePlayer();
});
adminPinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlockAdminView();
});
adminModal.addEventListener("click", (e) => {
  if (e.target === adminModal) closeAdminView();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !adminModal.hidden) closeAdminView();
});
