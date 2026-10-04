const KEY = "6b61bbfa-2a71-4b89-948f-b0d0c41a18f7";
const API = "https://api.keyval.org";

const START = new Date(2026, 9, 1);  // 2026-10-01
const END = new Date(2027, 2, 31);   // 2027-03-31

let data = {};
let selectedDate = new Date(2026, 9, 4);
let currentMonth = new Date(2026, 9, 1);

let snapshot = "";
let isSaving = false;


/* =========================
   DOM
========================= */

const calendar = document.getElementById("calendar");

const monthTitle = document.getElementById("monthTitle");
const monthMeta = document.getElementById("monthMeta");

const selectedDateEl = document.getElementById("selectedDate");
const selectedWeekdayEl = document.getElementById("selectedWeekday");

const editorScore = document.getElementById("editorScore");
const scoreInput = document.getElementById("scoreInput");

const infoDate = document.getElementById("infoDate");
const infoValue = document.getElementById("infoValue");

const totalScore = document.getElementById("totalScore");
const positiveScore = document.getElementById("positiveScore");
const negativeScore = document.getElementById("negativeScore");

const activeDays = document.getElementById("activeDays");
const activeCount = document.getElementById("activeCount");

const bestDay = document.getElementById("bestDay");

const progressBar = document.getElementById("progressBar");
const periodProgress = document.getElementById("periodProgress");
const periodProgressBar = document.getElementById("periodProgressBar");

const quote = document.getElementById("quote");

const syncText = document.getElementById("syncText");

const prevMonth = document.getElementById("prevMonth");
const nextMonth = document.getElementById("nextMonth");

const saveButton = document.getElementById("saveButton");
const resetButton = document.getElementById("resetButton");

const plus = document.getElementById("plus");
const minus = document.getElementById("minus");


/* =========================
   DATE HELPERS
========================= */

function pad(n) {
  return String(n).padStart(2, "0");
}

function keyOf(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-");
}

function dateFromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isAllowed(date) {
  return date >= START && date <= END;
}

function formatLong(date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function formatWeekday(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long"
  });
}

function monthName(date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}


/* =========================
   DATA
========================= */

function normalize(raw) {
  const result = {};

  const cursor = new Date(
    START.getFullYear(),
    START.getMonth(),
    START.getDate()
  );

  while (cursor <= END) {
    const key = keyOf(cursor);

    const value =
      raw &&
      typeof raw === "object" &&
      Number.isFinite(Number(raw[key]))
        ? Number(raw[key])
        : 0;

    result[key] = Math.trunc(value);

    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}


/* =========================
   KEYVAL
========================= */

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: "no-store"
    });
  } finally {
    clearTimeout(timer);
  }
}


async function getRemote() {
  const response = await fetchWithTimeout(
    `${API}/get/${KEY}?t=${Date.now()}`
  );

  if (!response.ok) {
    throw new Error("GET failed");
  }

  const text = await response.text();

  if (!text || text === "null") {
    return {};
  }

  let value = text;

  try {
    value = JSON.parse(value);
  } catch {}

  if (typeof value === "string") {
    try {
      value = decodeURIComponent(value);
    } catch {}

    try {
      value = JSON.parse(value);
    } catch {}
  }

  if (value && typeof value === "object") {
    return value;
  }

  return {};
}


async function setRemote(value) {
  const encoded = encodeURIComponent(
    JSON.stringify(value)
  );

  const response = await fetchWithTimeout(
    `${API}/set/${KEY}/${encoded}`,
    {
      method: "GET"
    },
    5000
  );

  if (!response.ok) {
    throw new Error("SET failed");
  }
}


/* =========================
   SYNC UI
========================= */

function setSyncStatus(type, text) {
  syncText.textContent = text;

  const dot = document.querySelector(".sync i");

  if (!dot) return;

  if (type === "online") {
    dot.style.background = "#61efb9";
    dot.style.boxShadow = "0 0 10px #61efb9";
  }

  if (type === "loading") {
    dot.style.background = "#ffcf5c";
    dot.style.boxShadow = "0 0 10px #ffcf5c";
  }

  if (type === "offline") {
    dot.style.background = "#ff6687";
    dot.style.boxShadow = "0 0 10px #ff6687";
  }
}


/* =========================
   LOAD
========================= */

async function load() {
  setSyncStatus("loading", "Connecting...");

  try {
    const remote = await getRemote();

    data = normalize(remote);
    snapshot = JSON.stringify(data);

    setSyncStatus("online", "Synced");

  } catch (error) {
    data = normalize({});

    setSyncStatus("offline", "Offline");
  }

  render();
}


/* =========================
   SYNC
========================= */

async function sync() {
  if (isSaving) return;

  try {
    const remote = normalize(
      await getRemote()
    );

    const nextSnapshot =
      JSON.stringify(remote);

    if (nextSnapshot !== snapshot) {
      data = remote;
      snapshot = nextSnapshot;

      render();
    }

    setSyncStatus("online", "Synced");

  } catch {
    setSyncStatus("offline", "Offline");
  }
}


/* =========================
   SELECT DATE
========================= */

function selectDate(date) {
  if (!isAllowed(date)) return;

  selectedDate = new Date(date);

  updateEditor();

  renderCalendar();
}


function updateEditor() {
  const key = keyOf(selectedDate);
  const value = Number(data[key] || 0);

  selectedDateEl.textContent =
    formatLong(selectedDate);

  selectedWeekdayEl.textContent =
    formatWeekday(selectedDate);

  editorScore.textContent = value;
  scoreInput.value = value;

  infoDate.textContent = key;
  infoValue.textContent = value;

  if (value > 0) {
    editorScore.style.color = "#62efbe";
    editorScore.style.webkitTextFillColor = "#62efbe";
  } else if (value < 0) {
    editorScore.style.color = "#ff6e8b";
    editorScore.style.webkitTextFillColor = "#ff6e8b";
  } else {
    editorScore.style.webkitTextFillColor = "transparent";
  }
}


/* =========================
   INPUT
========================= */

function changeInput(amount) {
  let value = Number(scoreInput.value) || 0;

  value += amount;

  scoreInput.value = value;
  editorScore.textContent = value;
  infoValue.textContent = value;
}

function quickChange(amount) {
  changeInput(amount);
}


/* =========================
   SAVE
========================= */

async function saveDate() {
  if (isSaving) return;

  const value = Math.trunc(
    Number(scoreInput.value) || 0
  );

  const key = keyOf(selectedDate);

  isSaving = true;

  saveButton.textContent = "SAVING...";

  try {
    /*
      저장 직전에 최신 서버값을 가져온다.
      다른 기기에서 바뀐 날짜들을 덮어쓰는 것을 최소화.
    */
    let latest;

    try {
      latest = normalize(await getRemote());
    } catch {
      latest = { ...data };
    }

    latest[key] = value;

    await setRemote(latest);

    data = latest;
    snapshot = JSON.stringify(data);

    setSyncStatus("online", "Saved");

    render();

  } catch (error) {
    setSyncStatus("offline", "Save failed");

  } finally {
    isSaving = false;
    saveButton.textContent = "SAVE SCORE";
  }
}


/* =========================
   CALENDAR
========================= */

function renderCalendar() {
  calendar.innerHTML = "";

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  monthTitle.textContent = monthName(currentMonth);

  const totalDays = daysInMonth(
    year,
    month
  );

  monthMeta.textContent =
    `${totalDays} days`;

  /*
    자기 달의 시작 요일만 빈칸으로 만든다.
    앞/뒤 달 날짜는 절대 만들지 않는다.
  */

  const firstDay =
    new Date(year, month, 1).getDay();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");

    empty.className = "day empty";

    calendar.appendChild(empty);
  }

  for (
    let dayNumber = 1;
    dayNumber <= totalDays;
    dayNumber++
  ) {
    const date =
      new Date(year, month, dayNumber);

    const key = keyOf(date);

    /*
      기간 밖이면 날짜 자체를 표시하지 않음.
      특히 2026년 10월 이전 / 2027년 4월 이후 제거.
    */

    if (!isAllowed(date)) {
      const empty = document.createElement("div");

      empty.className = "day empty";

      calendar.appendChild(empty);

      continue;
    }

    const value =
      Number(data[key] || 0);

    const cell =
      document.createElement("div");

    cell.className = "day";

    if (
      key === keyOf(selectedDate)
    ) {
      cell.classList.add("selected");
    }

    const now = new Date();

    if (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    ) {
      cell.classList.add("today");
    }

    let scoreClass = "zero";

    if (value > 0) {
      scoreClass = "positive";
    }

    if (value < 0) {
      scoreClass = "negative";
    }

    const scoreText =
      value > 0
        ? `+${value}`
        : `${value}`;

    const barWidth =
      Math.min(
        Math.abs(value) * 10,
        100
      );

    cell.innerHTML = `
      <div class="day-number">
        ${dayNumber}
      </div>

      <div class="day-score ${scoreClass}">
        ${scoreText}
      </div>

      <div class="day-bar">
        <div
          class="day-bar-fill ${scoreClass}"
          style="width:${barWidth}%"
        ></div>
      </div>
    `;

    cell.addEventListener(
      "pointerdown",
      () => {
        selectDate(date);
      }
    );

    calendar.appendChild(cell);
  }
}


/* =========================
   STATS
========================= */

function renderStats() {
  let total = 0;
  let positive = 0;
  let negative = 0;
  let active = 0;
  let best = 0;

  for (const value of Object.values(data)) {
    const n = Number(value) || 0;

    total += n;

    if (n > 0) {
      positive += n;
      active++;
    }

    if (n < 0) {
      negative += n;
      active++;
    }

    if (n > best) {
      best = n;
    }
  }

  const allDays =
    Object.keys(data).length;

  const completed =
    Object.values(data)
      .filter(v => Number(v) !== 0)
      .length;

  const progress =
    allDays === 0
      ? 0
      : Math.round(
          completed / allDays * 100
        );

  totalScore.textContent = total;

  positiveScore.textContent =
    `+${positive}`;

  negativeScore.textContent =
    negative;

  activeDays.textContent =
    `${active} days`;

  activeCount.textContent =
    active;

  bestDay.textContent =
    best > 0 ? `+${best}` : best;

  progressBar.style.width =
    `${Math.min(
      Math.max(
        (total + 100) / 200 * 100,
        0
      ),
      100
    )}%`;

  periodProgress.textContent =
    `${progress}%`;

  periodProgressBar.style.width =
    `${progress}%`;

  if (total >= 100) {
    quote.textContent =
      "You're not collecting points anymore. You're building a record.";
  } else if (total >= 50) {
    quote.textContent =
      "Small points are starting to become a serious score.";
  } else if (total > 0) {
    quote.textContent =
      "Every point counts. Keep stacking them.";
  } else if (total < 0) {
    quote.textContent =
      "A bad day is just a number. Change the next one.";
  } else {
    quote.textContent =
      "Small points become big results.";
  }
}


/* =========================
   MONTH NAVIGATION
========================= */

function canGoPrevious() {
  return (
    currentMonth.getFullYear() > START.getFullYear() ||
    (
      currentMonth.getFullYear() === START.getFullYear() &&
      currentMonth.getMonth() > START.getMonth()
    )
  );
}

function canGoNext() {
  return (
    currentMonth.getFullYear() < END.getFullYear() ||
    (
      currentMonth.getFullYear() === END.getFullYear() &&
      currentMonth.getMonth() < END.getMonth()
    )
  );
}


function moveMonth(direction) {
  const next = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + direction,
    1
  );

  if (
    direction < 0 &&
    !canGoPrevious()
  ) {
    return;
  }

  if (
    direction > 0 &&
    !canGoNext()
  ) {
    return;
  }

  currentMonth = next;

  renderCalendar();
}


/* =========================
   RESET
========================= */

function resetEditor() {
  const key = keyOf(selectedDate);

  scoreInput.value =
    Number(data[key] || 0);

  updateEditor();
}


/* =========================
   EVENTS
========================= */

document
  .querySelectorAll("[data-change]")
  .forEach(button => {
    button.addEventListener(
      "pointerdown",
      () => {
        quickChange(
          Number(button.dataset.change)
        );
      }
    );
  });


plus.addEventListener(
  "pointerdown",
  () => changeInput(1)
);

minus.addEventListener(
  "pointerdown",
  () => changeInput(-1)
);


scoreInput.addEventListener(
  "input",
  () => {
    const value =
      Number(scoreInput.value) || 0;

    editorScore.textContent = value;
    infoValue.textContent = value;
  }
);


scoreInput.addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      saveDate();
    }
  }
);


saveButton.addEventListener(
  "pointerdown",
  saveDate
);


resetButton.addEventListener(
  "pointerdown",
  resetEditor
);


prevMonth.addEventListener(
  "pointerdown",
  () => moveMonth(-1)
);


nextMonth.addEventListener(
  "pointerdown",
  () => moveMonth(1)
);


/* =========================
   RENDER
========================= */

function render() {
  renderCalendar();
  renderStats();
  updateEditor();
}


/* =========================
   INIT
========================= */

async function init() {
  data = normalize({});

  /*
    네트워크 연결을 기다리지 않고
    화면부터 즉시 보여준다.
  */
  render();

  await load();

  setInterval(
    sync,
    1000
  );
}


init();
