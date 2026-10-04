const BASE_KEY = "6b61bbfa-2a71-4b89-948f-b0d0c41a18f7";
const API = "https://api.keyval.org";

const START = new Date(2026, 9, 1);  // 2026-10-01
const END   = new Date(2027, 2, 31); // 2027-03-31

const SYNC_INTERVAL = 1000;
const REQUEST_TIMEOUT = 5000;


/* =========================================================
   MONTH DATABASE
========================================================= */

const MONTHS = [
  {
    year: 2026,
    month: 9,
    key: `${BASE_KEY}-2026-10`
  },
  {
    year: 2026,
    month: 10,
    key: `${BASE_KEY}-2026-11`
  },
  {
    year: 2026,
    month: 11,
    key: `${BASE_KEY}-2026-12`
  },
  {
    year: 2027,
    month: 0,
    key: `${BASE_KEY}-2027-01`
  },
  {
    year: 2027,
    month: 1,
    key: `${BASE_KEY}-2027-02`
  },
  {
    year: 2027,
    month: 2,
    key: `${BASE_KEY}-2027-03`
  }
];


/* =========================================================
   STATE
========================================================= */

let data = {};

let selectedDate =
  new Date(2026, 9, 4);

let currentMonth =
  new Date(2026, 9, 1);

let initialized = false;
let isSaving = false;
let syncLockedUntil = 0;


/* =========================================================
   ELEMENTS
========================================================= */

const $ = id =>
  document.getElementById(id);

const calendar =
  $("calendar");

const monthTitle =
  $("monthTitle");

const selectedDateText =
  $("selectedDate");

const scoreInput =
  $("scoreInput");

const totalScore =
  $("totalScore");

const positiveScore =
  $("positiveScore");

const negativeScore =
  $("negativeScore");

const activeDays =
  $("activeDays");

const bestDay =
  $("bestDay");

const progressBar =
  $("progressBar");

const syncStatus =
  $("syncStatus");

const saveButton =
  $("saveButton");


/* =========================================================
   DATE HELPERS
========================================================= */

function pad(number) {
  return String(number).padStart(2, "0");
}


function keyOf(date) {
  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}`
  );
}


function monthKey(year, month) {
  return (
    `${year}-${pad(month + 1)}`
  );
}


function daysInMonth(year, month) {
  return new Date(
    year,
    month + 1,
    0
  ).getDate();
}


function monthName(date) {
  return (
    `${date.getFullYear()}년 ` +
    `${date.getMonth() + 1}월`
  );
}


function formatLong(date) {
  return (
    `${date.getFullYear()}년 ` +
    `${date.getMonth() + 1}월 ` +
    `${date.getDate()}일`
  );
}


function formatWeekday(date) {
  return [
    "일요일",
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일"
  ][date.getDay()];
}


function isAllowed(date) {
  const value =
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    ).getTime();

  const start =
    new Date(
      START.getFullYear(),
      START.getMonth(),
      START.getDate()
    ).getTime();

  const end =
    new Date(
      END.getFullYear(),
      END.getMonth(),
      END.getDate()
    ).getTime();

  return (
    value >= start &&
    value <= end
  );
}


function getMonthInfo(year, month) {
  return MONTHS.find(
    item =>
      item.year === year &&
      item.month === month
  );
}


/* =========================================================
   LOCAL DATA
========================================================= */

function buildEmptyData() {
  const result = {};

  const cursor =
    new Date(
      START.getFullYear(),
      START.getMonth(),
      START.getDate()
    );

  while (cursor <= END) {
    result[keyOf(cursor)] = 0;

    cursor.setDate(
      cursor.getDate() + 1
    );
  }

  return result;
}


function createEmptyMonth(year, month) {
  return new Array(
    daysInMonth(year, month)
  ).fill(0);
}


function getLocalMonth(year, month) {
  const result =
    createEmptyMonth(
      year,
      month
    );

  for (
    let day = 1;
    day <= result.length;
    day++
  ) {
    const key =
      `${year}-` +
      `${pad(month + 1)}-` +
      `${pad(day)}`;

    result[day - 1] =
      Number(data[key]) || 0;
  }

  return result;
}


function applyMonth(
  year,
  month,
  values
) {
  if (!Array.isArray(values)) {
    return;
  }

  const days =
    daysInMonth(
      year,
      month
    );

  for (
    let day = 1;
    day <= days;
    day++
  ) {
    const key =
      `${year}-` +
      `${pad(month + 1)}-` +
      `${pad(day)}`;

    const value =
      Number(values[day - 1]);

    if (
      Number.isFinite(value)
    ) {
      data[key] =
        Math.trunc(value);
    }
  }
}


/* =========================================================
   NETWORK
========================================================= */

async function fetchWithTimeout(
  url,
  options = {},
  timeout = REQUEST_TIMEOUT
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeout
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal: controller.signal,
        cache: "no-store"
      }
    );
  } finally {
    clearTimeout(timer);
  }
}


/* =========================================================
   KEYVAL PARSER
========================================================= */

/*
  저장 형식은:

  0,0,1,0,-1,5,...

  처럼 아주 짧은 CSV 형식으로 사용한다.

  기존 JSON 형식도 읽을 수 있게 해둠.
*/

function parseMonthValue(text) {
  if (
    text === null ||
    text === undefined
  ) {
    return null;
  }

  let raw =
    String(text).trim();

  if (!raw) {
    return null;
  }


  /* -----------------------------------------
     1. CSV
  ----------------------------------------- */

  if (
    /^[-+]?[\d\s.,]+$/.test(raw)
  ) {
    const parts =
      raw.split(",");

    if (parts.length >= 1) {
      const values =
        parts.map(
          item => {
            const number =
              Number(item.trim());

            return Number.isFinite(number)
              ? Math.trunc(number)
              : 0;
          }
        );

      return values;
    }
  }


  /* -----------------------------------------
     2. JSON
  ----------------------------------------- */

  try {
    const parsed =
      JSON.parse(raw);

    if (
      Array.isArray(parsed)
    ) {
      return parsed;
    }

    if (
      parsed &&
      typeof parsed === "object"
    ) {
      if (
        Array.isArray(
          parsed.value
        )
      ) {
        return parsed.value;
      }

      if (
        typeof parsed.value ===
        "string"
      ) {
        try {
          const inner =
            JSON.parse(
              parsed.value
            );

          if (
            Array.isArray(inner)
          ) {
            return inner;
          }
        } catch {}
      }

      if (
        Array.isArray(
          parsed.data
        )
      ) {
        return parsed.data;
      }
    }

    if (
      typeof parsed === "string"
    ) {
      try {
        const inner =
          JSON.parse(parsed);

        if (
          Array.isArray(inner)
        ) {
          return inner;
        }
      } catch {}
    }

  } catch {}


  /* -----------------------------------------
     3. URL encoded
  ----------------------------------------- */

  try {
    const decoded =
      decodeURIComponent(raw);

    if (decoded !== raw) {
      const parsed =
        parseMonthValue(
          decoded
        );

      if (parsed) {
        return parsed;
      }
    }
  } catch {}


  return null;
}


/* =========================================================
   NORMALIZE
========================================================= */

function normalizeMonth(
  values,
  year,
  month
) {
  if (!Array.isArray(values)) {
    return null;
  }

  const result =
    createEmptyMonth(
      year,
      month
    );

  for (
    let i = 0;
    i < result.length;
    i++
  ) {
    const number =
      Number(values[i]);

    if (
      Number.isFinite(number)
    ) {
      result[i] =
        Math.trunc(number);
    }
  }

  return result;
}


/* =========================================================
   GET MONTH
========================================================= */

async function getMonth(
  year,
  month
) {
  const info =
    getMonthInfo(
      year,
      month
    );

  if (!info) {
    throw new Error(
      "Invalid month"
    );
  }

  const url =
    `${API}/get/` +
    `${encodeURIComponent(info.key)}` +
    `?t=${Date.now()}`;

  const response =
    await fetchWithTimeout(
      url
    );

  if (!response.ok) {
    throw new Error(
      `GET ${response.status}`
    );
  }

  const text =
    await response.text();

  /*
    아직 저장된 데이터가 없으면
    0으로 시작.
  */

  if (!text.trim()) {
    return createEmptyMonth(
      year,
      month
    );
  }

  const parsed =
    parseMonthValue(text);

  if (!parsed) {
    console.warn(
      "KeyVal response:",
      text
    );

    return createEmptyMonth(
      year,
      month
    );
  }

  return (
    normalizeMonth(
      parsed,
      year,
      month
    ) ||
    createEmptyMonth(
      year,
      month
    )
  );
}


/* =========================================================
   SET MONTH
========================================================= */

async function setMonth(
  year,
  month,
  values
) {
  const info =
    getMonthInfo(
      year,
      month
    );

  if (!info) {
    throw new Error(
      "Invalid month"
    );
  }

  /*
    JSON 대신 CSV를 사용해서
    KeyVal 값 길이를 최소화한다.
  */

  const value =
    values
      .map(
        number =>
          Math.trunc(
            Number(number) || 0
          )
      )
      .join(",");

  const url =
    `${API}/set/` +
    `${encodeURIComponent(info.key)}/` +
    `${encodeURIComponent(value)}`;

  const response =
    await fetchWithTimeout(
      url,
      {
        method: "GET"
      }
    );

  if (!response.ok) {
    throw new Error(
      `SET ${response.status}`
    );
  }

  return true;
}


/* =========================================================
   STATUS
========================================================= */

function setSyncStatus(
  type,
  text
) {
  if (!syncStatus) {
    return;
  }

  syncStatus.textContent =
    text;

  syncStatus.className =
    `sync-status ${type}`;
}


/* =========================================================
   LOAD ALL
========================================================= */

async function loadAll() {
  setSyncStatus(
    "loading",
    "Connecting..."
  );

  data =
    buildEmptyData();

  const results =
    await Promise.allSettled(
      MONTHS.map(
        month =>
          getMonth(
            month.year,
            month.month
          )
      )
    );

  let successCount = 0;

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

        successCount++;
      } else {
        console.warn(
          "Month load failed:",
          month,
          result.reason
        );
      }
    }
  );

  initialized = true;

  if (
    successCount ===
    MONTHS.length
  ) {
    setSyncStatus(
      "online",
      "Synced"
    );
  } else if (
    successCount > 0
  ) {
    setSyncStatus(
      "warning",
      `${successCount}/${MONTHS.length} synced`
    );
  } else {
    setSyncStatus(
      "offline",
      "Offline"
    );
  }

  render();
}


/* =========================================================
   SYNC
========================================================= */

async function sync() {
  if (!initialized) {
    return;
  }

  if (isSaving) {
    return;
  }

  if (
    Date.now() <
    syncLockedUntil
  ) {
    return;
  }

  const results =
    await Promise.allSettled(
      MONTHS.map(
        month =>
          getMonth(
            month.year,
            month.month
          )
      )
    );

  let successCount = 0;

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

      successCount++;
    }
  );

  if (
    successCount ===
    MONTHS.length
  ) {
    setSyncStatus(
      "online",
      "Synced"
    );
  } else if (
    successCount > 0
  ) {
    setSyncStatus(
      "warning",
      `${successCount}/${MONTHS.length} synced`
    );
  }

  render();
}


/* =========================================================
   DATE SELECTION
========================================================= */

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


/* =========================================================
   EDITOR
========================================================= */

function updateEditor() {
  if (!selectedDate) {
    return;
  }

  if (selectedDateText) {
    selectedDateText.textContent =
      formatLong(
        selectedDate
      );
  }

  const weekdayElement =
    document.querySelector(
      ".selected-weekday"
    );

  if (weekdayElement) {
    weekdayElement.textContent =
      formatWeekday(
        selectedDate
      );
  }

  if (scoreInput) {
    scoreInput.value =
      data[
        keyOf(selectedDate)
      ] ?? 0;
  }
}


function changeInput(amount) {
  if (!scoreInput) {
    return;
  }

  const current =
    Number(
      scoreInput.value
    ) || 0;

  scoreInput.value =
    Math.trunc(
      current + amount
    );
}


function resetScoreInput() {
  if (!scoreInput) {
    return;
  }

  scoreInput.value =
    data[
      keyOf(selectedDate)
    ] ?? 0;
}


/* =========================================================
   SAVE
========================================================= */

async function saveDate() {
  if (isSaving) {
    return;
  }

  if (!scoreInput) {
    return;
  }

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
      Number(
        scoreInput.value
      ) || 0
    );

  isSaving = true;

  syncLockedUntil =
    Date.now() + 3000;

  if (saveButton) {
    saveButton.disabled = true;

    saveButton.textContent =
      "SAVING...";
  }

  setSyncStatus(
    "loading",
    "Saving..."
  );

  try {
    /*
      서버 최신 데이터 확보
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

    /*
      선택한 날짜만 변경
    */

    monthData[
      day - 1
    ] = value;

    /*
      서버 저장
    */

    await setMonth(
      year,
      month,
      monthData
    );

    /*
      로컬 반영
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
      "Save failed:",
      error
    );

    setSyncStatus(
      "offline",
      "Save failed"
    );

  } finally {
    isSaving = false;

    if (saveButton) {
      saveButton.disabled =
        false;

      saveButton.textContent =
        "SAVE SCORE";
    }
  }
}


/* =========================================================
   CALENDAR
========================================================= */

function renderCalendar() {
  if (!calendar) {
    return;
  }

  /*
    주의:
    HTML에 이미 SUN~SAT가 있으므로
    JS에서는 요일을 만들지 않는다.
  */

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

  const todayKey =
    keyOf(new Date());

  const selectedKey =
    keyOf(selectedDate);


  /* -----------------------------------------
     앞쪽 빈칸
  ----------------------------------------- */

  for (
    let i = 0;
    i < firstDay;
    i++
  ) {
    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "day empty";

    calendar.appendChild(
      empty
    );
  }


  /* -----------------------------------------
     날짜
  ----------------------------------------- */

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
      Number(
        data[key]
      ) || 0;

    const cell =
      document.createElement(
        "button"
      );

    cell.type = "button";

    cell.className =
      "day";


    if (
      key === selectedKey
    ) {
      cell.classList.add(
        "selected"
      );
    }


    if (
      key === todayKey
    ) {
      cell.classList.add(
        "today"
      );
    }


    const number =
      document.createElement(
        "div"
      );

    number.className =
      "day-number";

    number.textContent =
      day;


    const score =
      document.createElement(
        "div"
      );

    score.className =
      "day-score";


    if (value > 0) {
      score.classList.add(
        "positive"
      );

      score.textContent =
        `+${value}`;

    } else if (
      value < 0
    ) {
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


    cell.appendChild(
      number
    );

    cell.appendChild(
      score
    );


    cell.addEventListener(
      "click",
      () => {
        selectDate(date);
      }
    );


    calendar.appendChild(
      cell
    );
  }


  /* -----------------------------------------
     뒤쪽 빈칸
  ----------------------------------------- */

  const totalCells =
    firstDay +
    totalDays;

  const remaining =
    (
      7 -
      (totalCells % 7)
    ) % 7;

  for (
    let i = 0;
    i < remaining;
    i++
  ) {
    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "day empty";

    calendar.appendChild(
      empty
    );
  }


  if (monthTitle) {
    monthTitle.textContent =
      monthName(
        currentMonth
      );
  }
}


/* =========================================================
   STATISTICS
========================================================= */

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
        const number =
          Number(value) || 0;

        total += number;

        if (
          number > 0
        ) {
          positive +=
            number;
        }

        if (
          number < 0
        ) {
          negative +=
            number;
        }

        if (
          number !== 0
        ) {
          active++;
        }

        if (
          number >
          bestValue
        ) {
          bestValue =
            number;

          bestKey =
            key;
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
        ? `${bestKey.slice(5)} : ${bestValue >= 0 ? "+" : ""}${bestValue}`
        : "-";
  }


  const totalDays =
    Object.keys(data).length;

  const progress =
    totalDays === 0
      ? 0
      : Math.round(
          (
            active /
            totalDays
          ) * 100
        );


  if (progressBar) {
    progressBar.style.width =
      `${progress}%`;
  }
}


/* =========================================================
   RENDER
========================================================= */

function render() {
  renderCalendar();
  renderStats();
  updateEditor();
}


/* =========================================================
   MONTH NAVIGATION
========================================================= */

function canGoPreviousMonth() {
  const previous =
    new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() - 1,
      1
    );

  const minimum =
    new Date(
      START.getFullYear(),
      START.getMonth(),
      1
    );

  return previous >= minimum;
}


function canGoNextMonth() {
  const next =
    new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      1
    );

  const maximum =
    new Date(
      END.getFullYear(),
      END.getMonth(),
      1
    );

  return next <= maximum;
}


function previousMonth() {
  if (
    !canGoPreviousMonth()
  ) {
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
  if (
    !canGoNextMonth()
  ) {
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


/* =========================================================
   EVENTS
========================================================= */


/* SAVE */

if (saveButton) {
  saveButton.addEventListener(
    "click",
    saveDate
  );
}


/* ENTER */

if (scoreInput) {
  scoreInput.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter"
      ) {
        saveDate();
      }
    }
  );
}


/* QUICK CHANGE */

document
  .querySelectorAll(
    "[data-add]"
  )
  .forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          const amount =
            Number(
              button.dataset.add
            );

          if (
            Number.isFinite(
              amount
            )
          ) {
            changeInput(
              amount
            );
          }
        }
      );
    }
  );


/* PREVIOUS */

const previousButton =
  $("prevMonth");

if (previousButton) {
  previousButton.addEventListener(
    "click",
    previousMonth
  );
}


/* NEXT */

const nextButton =
  $("nextMonth");

if (nextButton) {
  nextButton.addEventListener(
    "click",
    nextMonth
  );
}


/* RESET */

const resetButton =
  $("resetScore");

if (resetButton) {
  resetButton.addEventListener(
    "click",
    resetScoreInput
  );
}


/* =========================================================
   START
========================================================= */

function init() {
  data =
    buildEmptyData();

  /*
    초기 화면:
    2026-10-04 선택
  */

  render();

  /*
    KeyVal 불러오기
  */

  loadAll();

  /*
    자동 동기화
  */

  setInterval(
    sync,
    SYNC_INTERVAL
  );
}


init();
