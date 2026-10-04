const BASE_KEY = "6b61bbfa-2a71-4b89-948f-b0d0c41a18f7";
const API = "https://api.keyval.org";

const START = new Date(2026, 9, 1);
const END = new Date(2027, 2, 31);

const SYNC_INTERVAL = 1000;
const REQUEST_TIMEOUT = 5000;

const MONTHS = [
  { year: 2026, month: 9, key: `${BASE_KEY}-2026-10` },
  { year: 2026, month: 10, key: `${BASE_KEY}-2026-11` },
  { year: 2026, month: 11, key: `${BASE_KEY}-2026-12` },
  { year: 2027, month: 0, key: `${BASE_KEY}-2027-01` },
  { year: 2027, month: 1, key: `${BASE_KEY}-2027-02` },
  { year: 2027, month: 2, key: `${BASE_KEY}-2027-03` }
];

let data = {};
let selectedDate = new Date(2026, 9, 4);
let currentMonth = new Date(2026, 9, 1);

let initialized = false;
let isSaving = false;
let syncLockedUntil = 0;

const $ = id => document.getElementById(id);

const calendar = $("calendar");
const monthTitle = $("monthTitle");
const selectedDateText = $("selectedDate");
const scoreInput = $("scoreInput");
const totalScore = $("totalScore");
const positiveScore = $("positiveScore");
const negativeScore = $("negativeScore");
const activeDays = $("activeDays");
const bestDay = $("bestDay");
const progressBar = $("progressBar");
const syncStatus = $("syncStatus");
const saveButton = $("saveButton");


/* =========================
   DATE
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

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function monthName(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatLong(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatWeekday(date) {
  return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
}

function isAllowed(date) {
  const time = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();

  return (
    time >= new Date(
      START.getFullYear(),
      START.getMonth(),
      START.getDate()
    ).getTime()
    &&
    time <= new Date(
      END.getFullYear(),
      END.getMonth(),
      END.getDate()
    ).getTime()
  );
}

function getMonthInfo(year, month) {
  return MONTHS.find(
    m => m.year === year && m.month === month
  );
}


/* =========================
   DATA
========================= */

function buildEmptyData() {
  const result = {};

  const date = new Date(
    START.getFullYear(),
    START.getMonth(),
    START.getDate()
  );

  while (date <= END) {
    result[keyOf(date)] = 0;
    date.setDate(date.getDate() + 1);
  }

  return result;
}

function createEmptyMonth(year, month) {
  return new Array(
    daysInMonth(year, month)
  ).fill(0);
}

function getLocalMonth(year, month) {
  const result = createEmptyMonth(year, month);

  for (let day = 1; day <= result.length; day++) {
    const key =
      `${year}-${pad(month + 1)}-${pad(day)}`;

    result[day - 1] =
      Number(data[key]) || 0;
  }

  return result;
}

function applyMonth(year, month, values) {
  if (!Array.isArray(values)) return;

  const days = daysInMonth(year, month);

  for (let day = 1; day <= days; day++) {
    const key =
      `${year}-${pad(month + 1)}-${pad(day)}`;

    const value =
      Number(values[day - 1]);

    if (Number.isFinite(value)) {
      data[key] = Math.trunc(value);
    }
  }
}


/* =========================
   KEYVAL
========================= */

async function fetchWithTimeout(
  url,
  options = {},
  timeout = REQUEST_TIMEOUT
) {
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


/*
  KeyVal 응답은 경우에 따라

  [0,1,2]
  {"value":[0,1,2]}
  {"value":"[0,1,2]"}
  "[0,1,2]"

  등으로 들어올 수 있음.
*/

function parseValue(text) {
  if (text == null) {
    return null;
  }

  const raw = String(text).trim();

  if (!raw) {
    return null;
  }

  /* 직접 배열 */
  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    /* { value: [...] } */
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.value)
    ) {
      return parsed.value;
    }

    /* { value: "[...]" } */
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.value === "string"
    ) {
      try {
        const inner =
          JSON.parse(parsed.value);

        if (Array.isArray(inner)) {
          return inner;
        }
      } catch {}
    }

    /* JSON 문자열 "[...]" */
    if (typeof parsed === "string") {
      try {
        const inner =
          JSON.parse(parsed);

        if (Array.isArray(inner)) {
          return inner;
        }
      } catch {}
    }

  } catch {}


  /* URL encoded */
  try {
    const decoded =
      decodeURIComponent(raw);

    if (decoded !== raw) {
      try {
        const parsed =
          JSON.parse(decoded);

        if (Array.isArray(parsed)) {
          return parsed;
        }

        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray(parsed.value)
        ) {
          return parsed.value;
        }

        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.value === "string"
        ) {
          const inner =
            JSON.parse(parsed.value);

          if (Array.isArray(inner)) {
            return inner;
          }
        }

      } catch {}
    }

  } catch {}

  return null;
}


function normalizeMonth(values, year, month) {
  if (!Array.isArray(values)) {
    return null;
  }

  const result =
    createEmptyMonth(year, month);

  for (let i = 0; i < result.length; i++) {
    const value =
      Number(values[i]);

    if (Number.isFinite(value)) {
      result[i] =
        Math.trunc(value);
    }
  }

  return result;
}


async function getMonth(year, month) {
  const info =
    getMonthInfo(year, month);

  if (!info) {
    throw new Error("Invalid month");
  }

  const url =
    `${API}/get/${encodeURIComponent(info.key)}` +
    `?t=${Date.now()}`;

  const response =
    await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(
      `GET ${response.status}`
    );
  }

  const text =
    await response.text();

  /*
    새 KeyVal 키는 아직 값이 없을 수 있음.

    이 경우 에러로 처리하지 않고
    해당 월을 0으로 시작한다.
  */

  const parsed =
    parseValue(text);

  if (!parsed) {
    return createEmptyMonth(
      year,
      month
    );
  }

  const normalized =
    normalizeMonth(
      parsed,
      year,
      month
    );

  if (!normalized) {
    return createEmptyMonth(
      year,
      month
    );
  }

  return normalized;
}


async function setMonth(
  year,
  month,
  values
) {
  const info =
    getMonthInfo(year, month);

  if (!info) {
    throw new Error("Invalid month");
  }

  const json =
    JSON.stringify(values);

  const encoded =
    encodeURIComponent(json);

  const url =
    `${API}/set/` +
    `${encodeURIComponent(info.key)}/` +
    encoded;

  const response =
    await fetchWithTimeout(
      url,
      { method: "GET" }
    );

  if (!response.ok) {
    throw new Error(
      `SET ${response.status}`
    );
  }

  return true;
}


/* =========================
   STATUS
========================= */

function setSyncStatus(type, text) {
  if (!syncStatus) return;

  syncStatus.textContent = text;

  syncStatus.className =
    `sync-status ${type}`;
}


/* =========================
   LOAD
========================= */

async function loadAll() {
  setSyncStatus(
    "loading",
    "Connecting..."
  );

  data =
    buildEmptyData();

  const results =
    await Promise.allSettled(
      MONTHS.map(month =>
        getMonth(
          month.year,
          month.month
        )
      )
    );

  let success = 0;

  results.forEach(
    (result, index) => {
      const month =
        MONTHS[index];

      if (
        result.status ===
        "fulfilled"
      ) {
        applyMonth(
          month.year,
          month.month,
          result.value
        );

        success++;
      }
    }
  );

  initialized = true;

  if (
    success === MONTHS.length
  ) {
    setSyncStatus(
      "online",
      "Synced"
    );
  } else if (success > 0) {
    setSyncStatus(
      "warning",
      `${success}/${MONTHS.length} synced`
    );
  } else {
    setSyncStatus(
      "offline",
      "Offline"
    );
  }

  render();
}


/* =========================
   SYNC
========================= */

async function sync() {
  if (!initialized) return;
  if (isSaving) return;

  if (
    Date.now() <
    syncLockedUntil
  ) {
    return;
  }

  const results =
    await Promise.allSettled(
      MONTHS.map(month =>
        getMonth(
          month.year,
          month.month
        )
      )
    );

  let success = 0;

  /*
    서버에서 정상적으로 받은 월만
    로컬 데이터에 적용한다.

    실패한 월은 절대 0으로 덮지 않는다.
  */

  results.forEach(
    (result, index) => {
      if (
        result.status !==
        "fulfilled"
      ) {
        return;
      }

      const month =
        MONTHS[index];

      applyMonth(
        month.year,
        month.month,
        result.value
      );

      success++;
    }
  );

  if (
    success === MONTHS.length
  ) {
    setSyncStatus(
      "online",
      "Synced"
    );
  } else if (success > 0) {
    setSyncStatus(
      "warning",
      `${success}/${MONTHS.length} synced`
    );
  }

  render();
}


/* =========================
   DATE EDITOR
========================= */

function selectDate(date) {
  if (!isAllowed(date)) {
    return;
  }

  selectedDate =
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

  updateEditor();
  renderCalendar();
}


function updateEditor() {
  if (selectedDateText) {
    selectedDateText.textContent =
      formatLong(selectedDate);
  }

  if (scoreInput) {
    scoreInput.value =
      data[keyOf(selectedDate)] ?? 0;
  }
}


function changeInput(amount) {
  if (!scoreInput) return;

  const current =
    Number(scoreInput.value) || 0;

  scoreInput.value =
    Math.trunc(
      current + amount
    );
}


function resetScoreInput() {
  if (!scoreInput) return;

  scoreInput.value =
    data[keyOf(selectedDate)] ?? 0;
}


/* =========================
   SAVE
========================= */

async function saveDate() {
  if (isSaving) return;

  if (!scoreInput) return;

  const year =
    selectedDate.getFullYear();

  const month =
    selectedDate.getMonth();

  const day =
    selectedDate.getDate();

  const key =
    keyOf(selectedDate);

  const value =
    Math.trunc(
      Number(scoreInput.value) || 0
    );

  isSaving = true;

  syncLockedUntil =
    Date.now() + 3000;

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent =
      "SAVING...";
  }

  try {
    /*
      서버의 최신 월을 가져온다.
      없는 월이면 0 배열을 사용한다.
    */

    let monthData;

    try {
      monthData =
        await getMonth(
          year,
          month
        );
    } catch {
      monthData =
        getLocalMonth(
          year,
          month
        );
    }

    monthData[day - 1] =
      value;

    await setMonth(
      year,
      month,
      monthData
    );

    /*
      저장 성공 후 로컬 적용
    */

    applyMonth(
      year,
      month,
      monthData
    );

    setSyncStatus(
      "online",
      "Saved"
    );

    render();

  } catch (error) {
    console.error(
      "SAVE ERROR:",
      error
    );

    setSyncStatus(
      "offline",
      "Save failed"
    );

  } finally {
    isSaving = false;

    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent =
        "SAVE SCORE";
    }
  }
}


/* =========================
   CALENDAR
========================= */

function renderCalendar() {
  if (!calendar) return;

  calendar.innerHTML = "";

  const year =
    currentMonth.getFullYear();

  const month =
    currentMonth.getMonth();

  const firstDay =
    new Date(
      year,
      month,
      1
    ).getDay();

  const totalDays =
    daysInMonth(
      year,
      month
    );


  /* 요일 */

  const weekdays = [
    "SUN",
    "MON",
    "TUE",
    "WED",
    "THU",
    "FRI",
    "SAT"
  ];

  weekdays.forEach(day => {
    const el =
      document.createElement("div");

    /*
      기존 CSS가 .weekday-row span
      구조를 기대한다.
    */

    el.className =
      "weekday-row";

    const span =
      document.createElement("span");

    span.textContent =
      day;

    el.appendChild(span);

    calendar.appendChild(el);
  });


  /*
    앞쪽 빈칸
  */

  for (
    let i = 0;
    i < firstDay;
    i++
  ) {
    const empty =
      document.createElement("div");

    empty.className =
      "day empty";

    calendar.appendChild(empty);
  }


  /*
    날짜
  */

  const today =
    new Date();

  const todayKey =
    keyOf(today);

  const selectedKey =
    keyOf(selectedDate);

  for (
    let day = 1;
    day <= totalDays;
    day++
  ) {
    const date =
      new Date(
        year,
        month,
        day
      );

    const key =
      keyOf(date);

    const value =
      Number(data[key]) || 0;

    const cell =
      document.createElement("button");

    cell.type = "button";

    cell.className =
      "day";

    if (key === selectedKey) {
      cell.classList.add(
        "selected"
      );
    }

    if (key === todayKey) {
      cell.classList.add(
        "today"
      );
    }


    const number =
      document.createElement("div");

    number.className =
      "day-number";

    number.textContent =
      day;


    const score =
      document.createElement("div");

    score.className =
      "day-score";

    if (value > 0) {
      score.classList.add(
        "positive"
      );

      score.textContent =
        `+${value}`;

    } else if (value < 0) {
      score.classList.add(
        "negative"
      );

      score.textContent =
        value;

    } else {
      score.classList.add(
        "zero"
      );

      score.textContent =
        "0";
    }


    cell.appendChild(number);
    cell.appendChild(score);


    cell.addEventListener(
      "click",
      () => selectDate(date)
    );

    calendar.appendChild(cell);
  }


  /*
    뒤쪽 빈칸
  */

  const totalCells =
    firstDay + totalDays;

  const remaining =
    (7 -
      (totalCells % 7)) % 7;

  for (
    let i = 0;
    i < remaining;
    i++
  ) {
    const empty =
      document.createElement("div");

    empty.className =
      "day empty";

    calendar.appendChild(empty);
  }


  if (monthTitle) {
    monthTitle.textContent =
      monthName(currentMonth);
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

  let bestKey = null;
  let bestValue = -Infinity;

  Object.entries(data)
    .forEach(
      ([key, value]) => {
        const n =
          Number(value) || 0;

        total += n;

        if (n > 0) {
          positive += n;
        }

        if (n < 0) {
          negative += n;
        }

        if (n !== 0) {
          active++;
        }

        if (n > bestValue) {
          bestValue = n;
          bestKey = key;
        }
      }
    );


  if (totalScore) {
    totalScore.textContent =
      total > 0
        ? `+${total}`
        : total;
  }

  if (positiveScore) {
    positiveScore.textContent =
      `+${positive}`;
  }

  if (negativeScore) {
    negativeScore.textContent =
      negative;
  }

  if (activeDays) {
    activeDays.textContent =
      active;
  }

  if (bestDay) {
    bestDay.textContent =
      bestKey
        ? `${bestKey.slice(5)} : +${bestValue}`
        : "-";
  }


  const totalDays =
    Object.keys(data).length;

  const progress =
    totalDays === 0
      ? 0
      : Math.round(
          active / totalDays * 100
        );

  if (progressBar) {
    progressBar.style.width =
      `${progress}%`;
  }
}


/* =========================
   RENDER
========================= */

function render() {
  renderCalendar();
  renderStats();
  updateEditor();
}


/* =========================
   MONTH NAVIGATION
========================= */

function canGoPreviousMonth() {
  const previous =
    new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() - 1,
      1
    );

  return previous >=
    new Date(
      START.getFullYear(),
      START.getMonth(),
      1
    );
}


function canGoNextMonth() {
  const next =
    new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      1
    );

  return next <=
    new Date(
      END.getFullYear(),
      END.getMonth(),
      1
    );
}


function previousMonth() {
  if (!canGoPreviousMonth()) {
    return;
  }

  currentMonth =
    new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() - 1,
      1
    );

  renderCalendar();
}


function nextMonth() {
  if (!canGoNextMonth()) {
    return;
  }

  currentMonth =
    new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      1
    );

  renderCalendar();
}


/* =========================
   EVENTS
========================= */

if (saveButton) {
  saveButton.addEventListener(
    "click",
    saveDate
  );
}


if (scoreInput) {
  scoreInput.addEventListener(
    "keydown",
    event => {
      if (event.key === "Enter") {
        saveDate();
      }
    }
  );
}


document
  .querySelectorAll("[data-add]")
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        const amount =
          Number(
            button.dataset.add
          );

        if (
          Number.isFinite(amount)
        ) {
          changeInput(amount);
        }
      }
    );
  });


const prevButton =
  $("prevMonth");

if (prevButton) {
  prevButton.addEventListener(
    "click",
    previousMonth
  );
}


const nextButton =
  $("nextMonth");

if (nextButton) {
  nextButton.addEventListener(
    "click",
    nextMonth
  );
}


const resetButton =
  $("resetScore");

if (resetButton) {
  resetButton.addEventListener(
    "click",
    resetScoreInput
  );
}


/* =========================
   START
========================= */

function init() {
  data =
    buildEmptyData();

  render();

  loadAll();

  setInterval(
    sync,
    SYNC_INTERVAL
  );
}

init();
