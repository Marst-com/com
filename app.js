const BASE_KEY = "6b61bbfa-2a71-4b89-948f-b0d0c41a18f7";
const API = "https://api.keyval.org";

const START = new Date(2026, 9, 1);   // 2026-10-01
const END   = new Date(2027, 2, 31);  // 2027-03-31

const SYNC_INTERVAL = 500;
const REQUEST_TIMEOUT = 5000;

const MONTHS = [
  { year: 2026, month: 9,  key: `${BASE_KEY}-2026-10` },
  { year: 2026, month: 10, key: `${BASE_KEY}-2026-11` },
  { year: 2026, month: 11, key: `${BASE_KEY}-2026-12` },
  { year: 2027, month: 0,  key: `${BASE_KEY}-2027-01` },
  { year: 2027, month: 1,  key: `${BASE_KEY}-2027-02` },
  { year: 2027, month: 2,  key: `${BASE_KEY}-2027-03` }
];

let data = {};
let selectedDate = new Date(2026, 9, 4);
let currentMonth = new Date(2026, 9, 1);

let snapshot = "";
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

function pad(n) {
  return String(n).padStart(2, "0");
}

function keyOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKey(year, month) {
  return `${year}-${pad(month + 1)}`;
}

function isAllowed(date) {
  const t = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();

  return (
    t >= new Date(
      START.getFullYear(),
      START.getMonth(),
      START.getDate()
    ).getTime()
    &&
    t <= new Date(
      END.getFullYear(),
      END.getMonth(),
      END.getDate()
    ).getTime()
  );
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

function createEmptyMonth(year, month) {
  const days = daysInMonth(year, month);
  const arr = new Array(days);

  for (let i = 0; i < days; i++) {
    arr[i] = 0;
  }

  return arr;
}

function buildEmptyData() {
  const result = {};

  const cursor = new Date(
    START.getFullYear(),
    START.getMonth(),
    START.getDate()
  );

  while (cursor <= END) {
    result[keyOf(cursor)] = 0;
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

function getMonthInfo(year, month) {
  return MONTHS.find(
    m => m.year === year && m.month === month
  );
}

function getMonthData(year, month) {
  const info = getMonthInfo(year, month);

  if (!info) return null;

  const result = createEmptyMonth(year, month);

  for (let day = 1; day <= result.length; day++) {
    const key = `${year}-${pad(month + 1)}-${pad(day)}`;

    if (Object.prototype.hasOwnProperty.call(data, key)) {
      result[day - 1] = Number(data[key]) || 0;
    }
  }

  return result;
}

function parseMonthValue(text) {
  if (!text) return null;

  let value = String(text).trim();

  // 1. 그대로 JSON 파싱
  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    // {"value": [...]}
    if (parsed && Array.isArray(parsed.value)) {
      return parsed.value;
    }

    // {"value": "[0,1,2,...]"}
    if (parsed && typeof parsed.value === "string") {
      try {
        const inner = JSON.parse(parsed.value);

        if (Array.isArray(inner)) {
          return inner;
        }
      } catch {}
    }

    // {"data": [...]}
    if (parsed && Array.isArray(parsed.data)) {
      return parsed.data;
    }

    // {"data": "[...]"}
    if (parsed && typeof parsed.data === "string") {
      try {
        const inner = JSON.parse(parsed.data);

        if (Array.isArray(inner)) {
          return inner;
        }
      } catch {}
    }
  } catch {}

  // 2. URL encoded 값
  try {
    const decoded = decodeURIComponent(value);

    if (decoded !== value) {
      try {
        const parsed = JSON.parse(decoded);

        if (Array.isArray(parsed)) {
          return parsed;
        }

        if (parsed && Array.isArray(parsed.value)) {
          return parsed.value;
        }

        if (parsed && typeof parsed.value === "string") {
          const inner = JSON.parse(parsed.value);

          if (Array.isArray(inner)) {
            return inner;
          }
        }
      } catch {}
    }
  } catch {}

  // 3. JSON 문자열 안에 JSON이 들어간 경우
  try {
    const first = JSON.parse(value);

    if (typeof first === "string") {
      const second = JSON.parse(first);

      if (Array.isArray(second)) {
        return second;
      }
    }
  } catch {}

  // 4. 응답에 배열 부분만 들어있는 경우
  const match = value.match(/\[[\s\S]*\]/);

  if (match) {
    try {
      const parsed = JSON.parse(match[0]);

      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {}
  }

  console.warn("KeyVal raw response:", text);

  return null;
}
function normalizeMonth(raw, year, month) {
  const days = daysInMonth(year, month);
  const result = new Array(days).fill(0);

  if (!Array.isArray(raw)) {
    return null;
  }

  for (let i = 0; i < days; i++) {
    const n = Number(raw[i]);

    if (Number.isFinite(n)) {
      result[i] = Math.trunc(n);
    }
  }

  return result;
}

async function fetchWithTimeout(
  url,
  options = {},
  timeout = REQUEST_TIMEOUT
) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeout);

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

async function getMonth(year, month) {
  const info = getMonthInfo(year, month);

  if (!info) {
    throw new Error("Invalid month");
  }

  const url =
    `${API}/get/${encodeURIComponent(info.key)}` +
    `?t=${Date.now()}`;

  const response = await fetchWithTimeout(url);

  if (!response.ok) {
    throw new Error(`GET ${response.status}`);
  }

  const text = await response.text();

  // 아직 값이 없는 키
  if (!text || !text.trim()) {
    return createEmptyMonth(year, month);
  }

  const parsed = parseMonthValue(text);

  if (!parsed) {
    throw new Error(
      `Invalid response for ${info.key}`
    );
  }

  const normalized = normalizeMonth(
    parsed,
    year,
    month
  );

  if (!normalized) {
    throw new Error(
      `Invalid month data for ${info.key}`
    );
  }

  return normalized;
}

async function setMonth(year, month, values) {
  const info = getMonthInfo(year, month);

  if (!info) {
    throw new Error("Invalid month");
  }

  const json = JSON.stringify(values);
  const encoded = encodeURIComponent(json);

  const url =
    `${API}/set/${encodeURIComponent(info.key)}/${encoded}`;

  const response = await fetchWithTimeout(
    url,
    { method: "GET" }
  );

  if (!response.ok) {
    throw new Error(`SET ${response.status}`);
  }

  return true;
}

function applyMonth(year, month, values) {
  if (!Array.isArray(values)) {
    return;
  }

  const days = daysInMonth(year, month);

  for (let day = 1; day <= days; day++) {
    const key =
      `${year}-${pad(month + 1)}-${pad(day)}`;

    const value = Number(values[day - 1]);

    if (Number.isFinite(value)) {
      data[key] = Math.trunc(value);
    }
  }
}

function setSyncStatus(type, text) {
  if (!syncStatus) return;

  syncStatus.textContent = text;

  syncStatus.className =
    `sync-status ${type}`;
}

async function loadAll() {
  setSyncStatus("loading", "Connecting...");

  const empty = buildEmptyData();

  data = empty;

  /*
   * 모든 월을 동시에 요청.
   * 하나가 실패해도 성공한 월까지 전부 버리지 않음.
   */
  const results = await Promise.allSettled(
    MONTHS.map(m =>
      getMonth(m.year, m.month)
    )
  );

  let successCount = 0;

  results.forEach((result, index) => {
    if (result.status !== "fulfilled") {
      console.warn(
        "Month load failed:",
        MONTHS[index],
        result.reason
      );

      return;
    }

    const m = MONTHS[index];

    applyMonth(
      m.year,
      m.month,
      result.value
    );

    successCount++;
  });

  snapshot = JSON.stringify(data);

  if (successCount === MONTHS.length) {
    setSyncStatus("online", "Synced");
  } else if (successCount > 0) {
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

  initialized = true;

  render();
}

async function sync() {
  if (!initialized) return;

  if (isSaving) return;

  if (Date.now() < syncLockedUntil) {
    return;
  }

  try {
    const results = await Promise.allSettled(
      MONTHS.map(m =>
        getMonth(m.year, m.month)
      )
    );

    /*
     * 중요:
     *
     * 서버 응답 하나가 이상하다고
     * 전체 data를 0으로 만들지 않는다.
     */

    const nextData = { ...data };

    let successCount = 0;

    results.forEach((result, index) => {
      if (result.status !== "fulfilled") {
        return;
      }

      const m = MONTHS[index];

      const values = result.value;

      if (!Array.isArray(values)) {
        return;
      }

      for (
        let day = 1;
        day <= values.length;
        day++
      ) {
        const key =
          `${m.year}-${pad(m.month + 1)}-${pad(day)}`;

        const value = Number(values[day - 1]);

        if (Number.isFinite(value)) {
          nextData[key] = Math.trunc(value);
        }
      }

      successCount++;
    });

    /*
     * 최소 한 달이라도 정상적으로 받아왔을 때만
     * 변경 사항을 반영.
     */
    if (successCount > 0) {
      const nextSnapshot =
        JSON.stringify(nextData);

      if (nextSnapshot !== snapshot) {
        data = nextData;
        snapshot = nextSnapshot;
        render();
      }

      if (successCount === MONTHS.length) {
        setSyncStatus("online", "Synced");
      } else {
        setSyncStatus(
          "warning",
          `${successCount}/${MONTHS.length} synced`
        );
      }
    } else {
      setSyncStatus(
        "offline",
        "Sync retry..."
      );
    }

  } catch (error) {
    console.warn("Sync failed:", error);

    setSyncStatus(
      "offline",
      "Sync retry..."
    );
  }
}

function selectDate(date) {
  if (!isAllowed(date)) return;

  selectedDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  updateEditor();
  renderCalendar();
}

function updateEditor() {
  if (!selectedDateText || !scoreInput) {
    return;
  }

  selectedDateText.textContent =
    `${formatLong(selectedDate)} (${formatWeekday(selectedDate)})`;

  scoreInput.value =
    data[keyOf(selectedDate)] ?? 0;
}

function changeInput(amount) {
  const current =
    Number(scoreInput.value) || 0;

  scoreInput.value =
    Math.trunc(current + amount);
}

function quickChange(amount) {
  changeInput(amount);
}

async function saveDate() {
  if (isSaving) return;

  const key = keyOf(selectedDate);

  let value =
    Math.trunc(Number(scoreInput.value) || 0);

  isSaving = true;

  /*
   * 저장 직후 2.5초 동안 sync가
   * 방금 저장한 값을 되돌리지 못하게 함.
   */
  syncLockedUntil =
    Date.now() + 2500;

  if (saveButton) {
    saveButton.textContent = "SAVING...";
    saveButton.disabled = true;
  }

  try {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    /*
     * 현재 월의 최신 서버 데이터만 가져온다.
     * 다른 월까지 다시 쓰지 않음.
     */
    let latest;

    try {
      latest =
        await getMonth(year, month);
    } catch (error) {
      console.warn(
        "Could not fetch latest month:",
        error
      );

      /*
       * 서버 조회 실패 시 현재 로컬 월을 사용.
       */
      latest =
        getMonthData(year, month);
    }

    if (!Array.isArray(latest)) {
      throw new Error(
        "Invalid month data"
      );
    }

    latest[selectedDate.getDate() - 1] =
      value;

    /*
     * 서버 저장
     */
    await setMonth(
      year,
      month,
      latest
    );

    /*
     * 로컬 데이터 반영
     */
    data[key] = value;

    snapshot =
      JSON.stringify(data);

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
      saveButton.textContent =
        "SAVE SCORE";

      saveButton.disabled = false;
    }
  }
}

function renderCalendar() {
  if (!calendar) return;

  calendar.innerHTML = "";

  const year =
    currentMonth.getFullYear();

  const month =
    currentMonth.getMonth();

  const firstDay =
    new Date(year, month, 1).getDay();

  const totalDays =
    daysInMonth(year, month);

  /*
   * 요일 제목
   */
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

    el.className =
      "calendar-weekday";

    el.textContent = day;

    calendar.appendChild(el);
  });

  /*
   * 앞쪽 빈칸.
   * 이전 달 날짜를 표시하지 않는다.
   */
  for (let i = 0; i < firstDay; i++) {
    const empty =
      document.createElement("div");

    empty.className =
      "calendar-empty";

    calendar.appendChild(empty);
  }

  for (let day = 1; day <= totalDays; day++) {
    const date =
      new Date(year, month, day);

    const key =
      keyOf(date);

    const value =
      data[key] ?? 0;

    const cell =
      document.createElement("button");

    cell.type = "button";
    cell.className =
      "calendar-day";

    if (
      key === keyOf(selectedDate)
    ) {
      cell.classList.add("selected");
    }

    if (value > 0) {
      cell.classList.add("positive");
    }

    if (value < 0) {
      cell.classList.add("negative");
    }

    if (value === 0) {
      cell.classList.add("zero");
    }

    const number =
      document.createElement("span");

    number.className =
      "day-number";

    number.textContent =
      day;

    const score =
      document.createElement("span");

    score.className =
      "day-score";

    score.textContent =
      value > 0
        ? `+${value}`
        : `${value}`;

    cell.appendChild(number);
    cell.appendChild(score);

    /*
     * pointerdown 사용으로 클릭 지연 최소화
     */
    cell.addEventListener(
      "pointerdown",
      event => {
        event.preventDefault();
        selectDate(date);
      },
      { passive: false }
    );

    calendar.appendChild(cell);
  }

  /*
   * 뒤쪽 빈칸.
   * 다음 달 날짜를 표시하지 않는다.
   */
  const totalCells =
    firstDay + totalDays;

  const remaining =
    (7 - (totalCells % 7)) % 7;

  for (let i = 0; i < remaining; i++) {
    const empty =
      document.createElement("div");

    empty.className =
      "calendar-empty";

    calendar.appendChild(empty);
  }

  if (monthTitle) {
    monthTitle.textContent =
      monthName(currentMonth);
  }
}

function renderStats() {
  let total = 0;
  let positive = 0;
  let negative = 0;
  let active = 0;

  let bestKey = null;
  let bestValue = -Infinity;

  Object.entries(data).forEach(
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

  /*
   * 진행률:
   * 2026-10-01 ~ 2027-03-31
   */
  const totalPossible =
    Object.keys(data).length;

  const currentFilled =
    Object.values(data)
      .filter(v => Number(v) !== 0)
      .length;

  const progress =
    totalPossible === 0
      ? 0
      : Math.round(
          (currentFilled / totalPossible) * 100
        );

  if (progressBar) {
    progressBar.style.width =
      `${progress}%`;
  }
}

function render() {
  renderCalendar();
  renderStats();
  updateEditor();
}

function canGoPreviousMonth() {
  const previous =
    new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() - 1,
      1
    );

  return (
    previous >=
    new Date(
      START.getFullYear(),
      START.getMonth(),
      1
    )
  );
}

function canGoNextMonth() {
  const next =
    new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      1
    );

  return (
    next <=
    new Date(
      END.getFullYear(),
      END.getMonth(),
      1
    )
  );
}

function previousMonth() {
  if (!canGoPreviousMonth()) return;

  currentMonth =
    new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() - 1,
      1
    );

  renderCalendar();
}

function nextMonth() {
  if (!canGoNextMonth()) return;

  currentMonth =
    new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + 1,
      1
    );

  renderCalendar();
}

function resetScoreInput() {
  scoreInput.value =
    data[keyOf(selectedDate)] ?? 0;
}

/*
 * 버튼 연결
 */

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
          Number(button.dataset.add);

        if (Number.isFinite(amount)) {
          quickChange(amount);
        }
      }
    );
  });

const previousButton =
  $("prevMonth");

if (previousButton) {
  previousButton.addEventListener(
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

/*
 * 초기 화면
 */
function init() {
  data = buildEmptyData();

  render();

  loadAll();

  /*
   * 500ms마다 서버 확인.
   * 저장 중에는 자동 sync를 잠시 멈춘다.
   */
  setInterval(
    sync,
    SYNC_INTERVAL
  );
}

init();
