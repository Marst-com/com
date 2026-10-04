const KEY = "6b61bbfa-2a71-4b89-948f-b0d0c41a18f7";
const API = "https://api.keyval.org";

const START = new Date(2026, 9, 1);   // 2026-10-01
const END   = new Date(2027, 2, 31);  // 2027-03-31

const SYNC_INTERVAL = 500;
const REQUEST_TIMEOUT = 5000;

let data = {};
let selectedDate = new Date(2026, 9, 4);
let currentMonth = new Date(2026, 9, 1);

let snapshot = "";
let isSaving = false;
let syncLockedUntil = 0;
let initialized = false;


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
   DATE
========================= */

function pad(n) {
  return String(n).padStart(2, "0");
}

function keyOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
   DATA VALIDATION
========================= */

/*
  중요한 부분:
  서버에서 받은 값이 진짜 객체인지 확인한다.

  null / 빈 문자열 / 이상한 응답이면
  절대로 기존 데이터를 0으로 만들지 않는다.
*/

function isValidDataObject(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return false;
  }

  return true;
}


function normalize(raw) {
  const result = {};

  const cursor = new Date(
    START.getFullYear(),
    START.getMonth(),
    START.getDate()
  );

  while (cursor <= END) {
    const key = keyOf(cursor);

    if (
      raw &&
      Object.prototype.hasOwnProperty.call(raw, key) &&
      Number.isFinite(Number(raw[key]))
    ) {
      result[key] = Math.trunc(Number(raw[key]));
    } else {
      result[key] = 0;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}


/* =========================
   FETCH
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


/* =========================
   KEYVAL PARSER
========================= */

function parseKeyValResponse(text) {
  if (
    typeof text !== "string" ||
    text.trim() === ""
  ) {
    return null;
  }

  let value = text.trim();

  /*
    1차 JSON
  */
  try {
    const parsed = JSON.parse(value);

    if (isValidDataObject(parsed)) {
      return parsed;
    }

    if (typeof parsed === "string") {
      value = parsed;
    }
  } catch {}


  /*
    URL encoded JSON
  */
  try {
    const decoded = decodeURIComponent(value);

    if (decoded !== value) {
      try {
        const parsed = JSON.parse(decoded);

        if (isValidDataObject(parsed)) {
          return parsed;
        }
      } catch {}
    }
  } catch {}


  /*
    혹시 서버가 JSON 문자열 안에
    다시 JSON을 넣어둔 경우
  */
  try {
    const parsedAgain = JSON.parse(value);

    if (typeof parsedAgain === "string") {
      const second = JSON.parse(parsedAgain);

      if (isValidDataObject(second)) {
        return second;
      }
    }
  } catch {}

  return null;
}


/* =========================
   GET
========================= */

async function getRemote() {
  const response = await fetchWithTimeout(
    `${API}/get/${KEY}?t=${Date.now()}`
  );

  if (!response.ok) {
    throw new Error(`GET ${response.status}`);
  }

  const text = await response.text();

  const parsed = parseKeyValResponse(text);

  /*
    여기서 null이면
    "DB가 0이다"가 아니라
    "DB 응답을 읽지 못했다"이다.
  */

  if (!isValidDataObject(parsed)) {
    throw new Error("Invalid DB response");
  }

  return parsed;
}


/* =========================
   SET
========================= */

async function setRemote(value) {
  const json = JSON.stringify(value);
  const encoded = encodeURIComponent(json);

  const response = await fetchWithTimeout(
    `${API}/set/${KEY}/${encoded}`,
    {
      method: "GET"
    }
  );

  if (!response.ok) {
    throw new Error(`SET ${response.status}`);
  }

  return true;
}


/* =========================
   STATUS
========================= */

function setSyncStatus(type, text) {
  syncText.textContent = text;

  const dot =
    document.querySelector(".sync i");

  if (!dot) return;

  if (type === "online") {
    dot.style.background = "#61efb9";
    dot.style.boxShadow =
      "0 0 10px #61efb9";
  }

  if (type === "loading") {
    dot.style.background = "#ffcf5c";
    dot.style.boxShadow =
      "0 0 10px #ffcf5c";
  }

  if (type === "offline") {
    dot.style.background = "#ff6687";
    dot.style.boxShadow =
      "0 0 10px #ff6687";
  }
}


/* =========================
   INITIAL LOAD
========================= */

async function load() {
  setSyncStatus(
    "loading",
    "Connecting..."
  );

  try {
    const remote = await getRemote();

    /*
      정상적인 객체일 때만 적용
    */
    data = normalize(remote);
    snapshot = JSON.stringify(data);

    setSyncStatus(
      "online",
      "Synced"
    );

  } catch (error) {
    /*
      DB가 비어 있거나 아직 생성되지 않은 경우
      최초 1회만 0으로 시작한다.

      이후 sync에서 오류가 난다고
      기존 데이터를 0으로 바꾸지는 않는다.
    */

    if (!initialized) {
      data = normalize({});
      snapshot = JSON.stringify(data);
    }

    setSyncStatus(
      "offline",
      "Offline"
    );
  }

  initialized = true;

  render();
}


/* =========================
   FAST SYNC
========================= */

async function sync() {
  if (!initialized) return;

  if (isSaving) return;

  /*
    저장 직후 일정 시간 동안
    GET이 이전 DB 값을 가져오는 것을 방지.
  */
  if (Date.now() < syncLockedUntil) {
    return;
  }

  try {
    const remote = await getRemote();

    /*
      정상 응답만 처리
    */
    if (!isValidDataObject(remote)) {
      return;
    }

    const normalized =
      normalize(remote);

    const nextSnapshot =
      JSON.stringify(normalized);

    /*
      실제 값이 바뀌었을 때만 렌더링
    */
    if (nextSnapshot !== snapshot) {
      data = normalized;
      snapshot = nextSnapshot;

      render();
    }

    setSyncStatus(
      "online",
      "Synced"
    );

  } catch {
    /*
      실패했다고 기존 data를 건드리지 않는다.
    */

    setSyncStatus(
      "offline",
      "Sync retry..."
    );
  }
}


/* =========================
   SELECT
========================= */

function selectDate(date) {
  if (!isAllowed(date)) {
    return;
  }

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
    editorScore.style.webkitTextFillColor =
      "#62efbe";
  } else if (value < 0) {
    editorScore.style.webkitTextFillColor =
      "#ff6e8b";
  } else {
    editorScore.style.webkitTextFillColor =
      "transparent";
  }
}


/* =========================
   INPUT
========================= */

function changeInput(amount) {
  let value =
    Number(scoreInput.value) || 0;

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

  /*
    저장하는 동안 sync 차단
  */
  syncLockedUntil =
    Date.now() + 2500;

  saveButton.textContent =
    "SAVING...";

  try {
    /*
      최신 서버 데이터 가져오기
    */
    let latest;

    try {
      const remote =
        await getRemote();

      if (isValidDataObject(remote)) {
        latest = normalize(remote);
      } else {
        throw new Error(
          "Invalid remote data"
        );
      }

    } catch {
      /*
        서버 조회 실패 시
        현재 정상 로컬 데이터를 기반으로 저장
      */
      latest = {
        ...data
      };
    }


    /*
      딱 선택한 날짜만 수정
    */
    latest[key] = value;


    /*
      서버 저장
    */
    await setRemote(latest);


    /*
      저장 성공했으므로 로컬 반영
    */
    data = latest;

    snapshot =
      JSON.stringify(data);


    /*
      저장 직후 2.5초간 sync 금지.
      이전 서버 응답이 늦게 도착해서
      저장값을 되돌리는 현상을 방지.
    */
    syncLockedUntil =
      Date.now() + 2500;


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

    saveButton.textContent =
      "SAVE SCORE";
  }
}


/* =========================
   CALENDAR
========================= */

function renderCalendar() {
  calendar.innerHTML = "";

  const year =
    currentMonth.getFullYear();

  const month =
    currentMonth.getMonth();

  monthTitle.textContent =
    monthName(currentMonth);

  const totalDays =
    daysInMonth(year, month);

  monthMeta.textContent =
    `${totalDays} days`;


  /*
    현재 달 1일의 요일만 빈칸으로 만든다.
    앞뒤 달 날짜는 절대 생성하지 않는다.
  */

  const firstDay =
    new Date(year, month, 1).getDay();

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


  for (
    let dayNumber = 1;
    dayNumber <= totalDays;
    dayNumber++
  ) {
    const date =
      new Date(
        year,
        month,
        dayNumber
      );

    if (!isAllowed(date)) {
      const empty =
        document.createElement("div");

      empty.className =
        "day empty";

      calendar.appendChild(empty);

      continue;
    }

    const key = keyOf(date);

    const value =
      Number(data[key] || 0);

    const cell =
      document.createElement("div");

    cell.className = "day";


    if (
      key === keyOf(selectedDate)
    ) {
      cell.classList.add(
        "selected"
      );
    }


    const now = new Date();

    if (
      date.getFullYear() ===
        now.getFullYear() &&
      date.getMonth() ===
        now.getMonth() &&
      date.getDate() ===
        now.getDate()
    ) {
      cell.classList.add(
        "today"
      );
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
      () => selectDate(date)
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

  for (
    const value of Object.values(data)
  ) {
    const n =
      Number(value) || 0;

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
      .filter(
        value => Number(value) !== 0
      )
      .length;


  const progress =
    allDays === 0
      ? 0
      : Math.round(
          completed /
          allDays *
          100
        );


  totalScore.textContent =
    total;

  positiveScore.textContent =
    `+${positive}`;

  negativeScore.textContent =
    negative;

  activeDays.textContent =
    `${active} days`;

  activeCount.textContent =
    active;

  bestDay.textContent =
    best > 0
      ? `+${best}`
      : best;


  /*
    총점 표시용
  */
  const scorePercent =
    Math.min(
      Math.max(
        (total + 100) / 200 * 100,
        0
      ),
      100
    );

  progressBar.style.width =
    `${scorePercent}%`;


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
   MONTH
========================= */

function canGoPrevious() {
  return (
    currentMonth.getFullYear() >
      START.getFullYear() ||
    (
      currentMonth.getFullYear() ===
        START.getFullYear() &&
      currentMonth.getMonth() >
        START.getMonth()
    )
  );
}


function canGoNext() {
  return (
    currentMonth.getFullYear() <
      END.getFullYear() ||
    (
      currentMonth.getFullYear() ===
        END.getFullYear() &&
      currentMonth.getMonth() <
        END.getMonth()
    )
  );
}


function moveMonth(direction) {
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

  currentMonth =
    new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() +
        direction,
      1
    );

  renderCalendar();
}


/* =========================
   RESET
========================= */

function resetEditor() {
  const key =
    keyOf(selectedDate);

  scoreInput.value =
    Number(data[key] || 0);

  updateEditor();
}


/* =========================
   EVENTS
========================= */

document
  .querySelectorAll(
    "[data-change]"
  )
  .forEach(button => {
    button.addEventListener(
      "pointerdown",
      () => {
        quickChange(
          Number(
            button.dataset.change
          )
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

    editorScore.textContent =
      value;

    infoValue.textContent =
      value;
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
  /*
    화면 먼저 표시
  */
  data = normalize({});

  render();

  /*
    DB 최초 로드
  */
  await load();

  /*
    500ms마다 빠른 동기화
  */
  setInterval(
    sync,
    SYNC_INTERVAL
  );
}


init();
