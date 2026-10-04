"use strict";


/* =========================================================
   CONFIG
========================================================= */

const KEY =
    "6b61bbfa-2a71-4b89-948f-b0d0c41a18f7";

const API =
    "https://api.keyval.org";

const START =
    new Date(2026, 8, 1);

const END =
    new Date(2027, 2, 31);


/* =========================================================
   STATE
========================================================= */

let data = {};

let selectedDate = null;

let currentMonth =
    new Date(2026, 8, 1);

let snapshot = "";

let isSaving = false;


/* =========================================================
   DOM
========================================================= */

const $ = selector =>
    document.querySelector(selector);


const calendar =
    $("#calendar");

const monthTitle =
    $("#monthTitle");

const monthMeta =
    $("#monthMeta");

const totalScore =
    $("#totalScore");

const totalDescription =
    $("#totalDescription");

const positiveScore =
    $("#positiveScore");

const negativeScore =
    $("#negativeScore");

const activeDays =
    $("#activeDays");

const bestDay =
    $("#bestDay");

const progressPercent =
    $("#progressPercent");

const progressBar =
    $("#progressBar");

const quote =
    $("#quote");

const selectedDateElement =
    $("#selectedDate");

const selectedWeekday =
    $("#selectedWeekday");

const editorValue =
    $("#editorValue");

const valueInput =
    $("#valueInput");

const infoDate =
    $("#infoDate");

const infoStatus =
    $("#infoStatus");

const infoValue =
    $("#infoValue");

const infoSync =
    $("#infoSync");

const syncDot =
    $("#syncDot");

const syncText =
    $("#syncText");

const prevMonth =
    $("#prevMonth");

const nextMonth =
    $("#nextMonth");

const saveButton =
    $("#saveButton");

const resetButton =
    $("#resetButton");

const minusButton =
    $("#minusButton");

const plusButton =
    $("#plusButton");


/* =========================================================
   DATE HELPERS
========================================================= */

function pad(number) {

    return String(number)
        .padStart(2, "0");

}


function dateKey(date) {

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join("-");

}


function keyToDate(key) {

    const parts =
        key.split("-")
            .map(Number);

    return new Date(
        parts[0],
        parts[1] - 1,
        parts[2]
    );

}


function cloneDate(date) {

    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    );

}


function isSameDay(a, b) {

    if (!a || !b) {

        return false;

    }

    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );

}


function isAllowedDate(date) {

    return (
        date >= START &&
        date <= END
    );

}


function monthStart(date) {

    return new Date(
        date.getFullYear(),
        date.getMonth(),
        1
    );

}


/* =========================================================
   ALL VALID DATES
========================================================= */

function makeDateKeys() {

    const result = [];

    const cursor =
        cloneDate(START);


    while (cursor <= END) {

        result.push(
            dateKey(cursor)
        );

        cursor.setDate(
            cursor.getDate() + 1
        );

    }


    return result;

}


const RANGE_KEYS =
    makeDateKeys();


/* =========================================================
   NORMALIZE DATA
========================================================= */

function normalize(remote) {

    const result = {};


    for (
        const key of RANGE_KEYS
    ) {

        result[key] = 0;

    }


    if (
        !remote ||
        typeof remote !== "object" ||
        Array.isArray(remote)
    ) {

        return result;

    }


    for (
        const key of RANGE_KEYS
    ) {

        const value =
            remote[key];


        if (
            Number.isFinite(value)
        ) {

            result[key] =
                Math.trunc(value);

        }

    }


    return result;

}


/* =========================================================
   FETCH TIMEOUT
========================================================= */

async function fetchWithTimeout(
    url,
    options = {},
    timeout = 5000
) {

    const controller =
        new AbortController();


    const timer =
        setTimeout(
            () => {
                controller.abort();
            },
            timeout
        );


    try {

        return await fetch(
            url,
            {
                ...options,
                signal:
                    controller.signal
            }
        );

    } finally {

        clearTimeout(timer);

    }

}


/* =========================================================
   PARSE KEYVAL RESPONSE
========================================================= */

function parseKeyValResponse(raw) {

    if (
        !raw ||
        !raw.trim()
    ) {

        return {};

    }


    let value =
        raw.trim();


    /*
       Try direct JSON first.
    */

    try {

        const parsed =
            JSON.parse(value);


        if (
            typeof parsed === "object" &&
            parsed !== null
        ) {

            return parsed;

        }


        if (
            typeof parsed === "string"
        ) {

            value = parsed;

        }

    } catch {

        // Continue.
    }


    /*
       Try URL decoding.
    */

    try {

        value =
            decodeURIComponent(value);

    } catch {

        // Continue.
    }


    /*
       Try JSON again.
    */

    try {

        const parsed =
            JSON.parse(value);


        if (
            typeof parsed === "string"
        ) {

            try {

                return JSON.parse(
                    parsed
                );

            } catch {

                return {};

            }

        }


        return parsed;

    } catch {

        return {};

    }

}


/* =========================================================
   GET REMOTE
========================================================= */

async function getRemote() {

    const url =
        `${API}/get/${KEY}?t=${Date.now()}`;


    const response =
        await fetchWithTimeout(
            url,
            {
                method: "GET",

                cache: "no-store",

                headers: {
                    "Accept":
                        "application/json,text/plain,*/*"
                }
            },
            5000
        );


    if (!response.ok) {

        throw new Error(
            `KeyVal GET ${response.status}`
        );

    }


    const raw =
        await response.text();


    return parseKeyValResponse(
        raw
    );

}


/* =========================================================
   SET REMOTE
========================================================= */

async function setRemote(value) {

    const json =
        JSON.stringify(value);


    const encoded =
        encodeURIComponent(json);


    const url =
        `${API}/set/${KEY}/${encoded}`;


    const response =
        await fetchWithTimeout(
            url,
            {
                method: "GET",

                cache: "no-store"
            },
            5000
        );


    if (!response.ok) {

        throw new Error(
            `KeyVal SET ${response.status}`
        );

    }


    return true;

}


/* =========================================================
   CONNECTION UI
========================================================= */

function setSyncStatus(
    status,
    message
) {

    syncDot.className =
        "connection-dot";


    if (
        status === "online"
    ) {

        syncDot.classList.add(
            "online"
        );

    }


    if (
        status === "error"
    ) {

        syncDot.classList.add(
            "error"
        );

    }


    syncText.textContent =
        message;

}


/* =========================================================
   LOAD
========================================================= */

async function load() {

    setSyncStatus(
        "loading",
        "Connecting..."
    );


    try {

        const remote =
            await getRemote();


        data =
            normalize(remote);


        snapshot =
            JSON.stringify(data);


        setSyncStatus(
            "online",
            "Synced"
        );


        infoSync.textContent =
            "Connected";


    } catch (error) {

        console.warn(
            "Initial KeyVal connection failed:",
            error
        );


        /*
           서버가 실패해도
           절대로 화면 렌더링을 막지 않는다.
        */

        data =
            normalize({});


        snapshot =
            JSON.stringify(data);


        setSyncStatus(
            "error",
            "Offline"
        );


        infoSync.textContent =
            "Offline";

    }


    render();

}


/* =========================================================
   SYNC
========================================================= */

async function sync() {

    if (isSaving) {

        return;

    }


    try {

        const remote =
            await getRemote();


        const normalized =
            normalize(remote);


        const nextSnapshot =
            JSON.stringify(
                normalized
            );


        if (
            nextSnapshot !== snapshot
        ) {

            data =
                normalized;


            snapshot =
                nextSnapshot;


            render();

        }


        setSyncStatus(
            "online",
            "Synced"
        );


    } catch (error) {

        console.warn(
            "Sync failed:",
            error
        );


        setSyncStatus(
            "error",
            "Offline"
        );

    }

}


/* =========================================================
   SAVE DATE
========================================================= */

async function saveDate() {

    if (
        !selectedDate ||
        isSaving
    ) {

        return;

    }


    let value =
        Number.parseInt(
            valueInput.value,
            10
        );


    if (
        !Number.isFinite(value)
    ) {

        value = 0;

    }


    value =
        Math.trunc(value);


    isSaving = true;


    saveButton.disabled =
        true;


    saveButton.innerHTML =
        "<span>저장 중...</span>";


    try {

        /*
           다른 기기에서 변경된 값이 있을 수 있으므로
           저장 직전에 최신 서버 상태를 다시 가져온다.
        */

        const remote =
            await getRemote();


        const latest =
            normalize(remote);


        latest[selectedDate] =
            value;


        await setRemote(
            latest
        );


        data =
            latest;


        snapshot =
            JSON.stringify(
                latest
            );


        setSyncStatus(
            "online",
            "Saved"
        );


        infoSync.textContent =
            "Saved";


        render();

        updateEditor();


    } catch (error) {

        console.error(
            "Save failed:",
            error
        );


        setSyncStatus(
            "error",
            "Save failed"
        );


        infoSync.textContent =
            "Failed";

    } finally {

        isSaving = false;

        saveButton.disabled =
            false;

        saveButton.innerHTML =
            "<span>저장</span><span>↗</span>";

    }

}


/* =========================================================
   SELECT DATE
========================================================= */

function selectDate(key) {

    if (
        !RANGE_KEYS.includes(key)
    ) {

        return;

    }


    selectedDate =
        key;


    updateEditor();

    renderCalendar();

}


/* =========================================================
   UPDATE EDITOR
========================================================= */

function updateEditor() {

    if (!selectedDate) {

        return;

    }


    const date =
        keyToDate(
            selectedDate
        );


    const value =
        data[selectedDate] ?? 0;


    const weekdays = [
        "일요일",
        "월요일",
        "화요일",
        "수요일",
        "목요일",
        "금요일",
        "토요일"
    ];


    selectedDateElement.textContent =
        `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;


    selectedWeekday.textContent =
        weekdays[
            date.getDay()
        ];


    editorValue.textContent =
        formatScore(value);


    valueInput.value =
        String(value);


    infoDate.textContent =
        selectedDate;


    infoValue.textContent =
        formatScore(value);


    editorValue.classList.remove(
        "positive",
        "negative"
    );


    infoValue.className =
        "";


    if (value > 0) {

        editorValue.style.color =
            "#a79aff";

        infoValue.classList.add(
            "positive"
        );

        infoStatus.textContent =
            "Positive";

    } else if (value < 0) {

        editorValue.style.color =
            "#ff7895";

        infoValue.classList.add(
            "negative"
        );

        infoStatus.textContent =
            "Negative";

    } else {

        editorValue.style.color =
            "#f1f2fa";

        infoStatus.textContent =
            "Zero";

    }

}


/* =========================================================
   FORMAT SCORE
========================================================= */

function formatScore(value) {

    if (value > 0) {

        return `+${value}`;

    }


    return String(value);

}


/* =========================================================
   UPDATE PREVIEW
========================================================= */

function updateEditorPreview() {

    let value =
        Number.parseInt(
            valueInput.value,
            10
        );


    if (
        !Number.isFinite(value)
    ) {

        value = 0;

    }


    editorValue.textContent =
        formatScore(value);


    if (value > 0) {

        editorValue.style.color =
            "#a79aff";

    } else if (value < 0) {

        editorValue.style.color =
            "#ff7895";

    } else {

        editorValue.style.color =
            "#f1f2fa";

    }

}


/* =========================================================
   CHANGE INPUT
========================================================= */

function changeInput(delta) {

    let value =
        Number.parseInt(
            valueInput.value,
            10
        );


    if (
        !Number.isFinite(value)
    ) {

        value = 0;

    }


    value += delta;


    valueInput.value =
        String(value);


    updateEditorPreview();

}


/* =========================================================
   QUICK BUTTONS
========================================================= */

document
    .querySelectorAll(
        ".quick-button"
    )
    .forEach(
        button => {

            button.addEventListener(
                "pointerdown",
                event => {

                    event.preventDefault();


                    const delta =
                        Number(
                            button.dataset.delta
                        );


                    changeInput(
                        delta
                    );

                }
            );

        }
    );


/* =========================================================
   PLUS / MINUS
========================================================= */

minusButton.addEventListener(
    "pointerdown",
    event => {

        event.preventDefault();

        changeInput(-1);

    }
);


plusButton.addEventListener(
    "pointerdown",
    event => {

        event.preventDefault();

        changeInput(1);

    }
);


/* =========================================================
   INPUT
========================================================= */

valueInput.addEventListener(
    "input",
    updateEditorPreview
);


valueInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter"
        ) {

            event.preventDefault();

            saveDate();

        }

    }
);


/* =========================================================
   SAVE
========================================================= */

saveButton.addEventListener(
    "pointerdown",
    event => {

        event.preventDefault();

        saveDate();

    }
);


/* =========================================================
   RESET
========================================================= */

resetButton.addEventListener(
    "pointerdown",
    event => {

        event.preventDefault();


        valueInput.value =
            "0";


        updateEditorPreview();

    }
);


/* =========================================================
   MONTH NAVIGATION
========================================================= */

prevMonth.addEventListener(
    "pointerdown",
    event => {

        event.preventDefault();


        const next =
            new Date(
                currentMonth.getFullYear(),
                currentMonth.getMonth() - 1,
                1
            );


        if (
            next >= monthStart(START)
        ) {

            currentMonth =
                next;


            renderCalendar();

        }

    }
);


nextMonth.addEventListener(
    "pointerdown",
    event => {

        event.preventDefault();


        const next =
            new Date(
                currentMonth.getFullYear(),
                currentMonth.getMonth() + 1,
                1
            );


        if (
            next <= monthStart(END)
        ) {

            currentMonth =
                next;


            renderCalendar();

        }

    }
);


/* =========================================================
   CALENDAR RENDER
========================================================= */

function renderCalendar() {

    const year =
        currentMonth.getFullYear();


    const month =
        currentMonth.getMonth();


    monthTitle.textContent =
        `${year}년 ${month + 1}월`;


    const first =
        new Date(
            year,
            month,
            1
        );


    const last =
        new Date(
            year,
            month + 1,
            0
        );


    monthMeta.textContent =
        `${last.getDate()} DAYS`;


    const fragment =
        document.createDocumentFragment();


    const firstWeekday =
        first.getDay();


    for (
        let index = 0;
        index < 42;
        index++
    ) {

        const date =
            new Date(
                year,
                month,
                index - firstWeekday + 1
            );


        const cell =
            document.createElement(
                "div"
            );


        cell.className =
            "day";


        const allowed =
            isAllowedDate(date);


        if (!allowed) {

            cell.classList.add(
                "outside"
            );

        }


        const key =
            dateKey(date);


        const value =
            allowed
                ? (data[key] ?? 0)
                : 0;


        if (
            allowed &&
            isSameDay(
                date,
                new Date()
            )
        ) {

            cell.classList.add(
                "today"
            );

        }


        if (
            allowed &&
            selectedDate === key
        ) {

            cell.classList.add(
                "selected"
            );

        }


        if (value > 0) {

            cell.classList.add(
                "positive"
            );

        }


        if (value < 0) {

            cell.classList.add(
                "negative"
            );

        }


        const number =
            document.createElement(
                "span"
            );


        number.className =
            "day-number";


        number.textContent =
            date.getDate();


        const score =
            document.createElement(
                "span"
            );


        score.className =
            "day-value";


        score.textContent =
            formatScore(value);


        const bar =
            document.createElement(
                "div"
            );


        bar.className =
            "day-bar";


        const fill =
            document.createElement(
                "div"
            );


        fill.className =
            "day-bar-fill";


        if (
            value !== 0
        ) {

            const width =
                Math.min(
                    100,
                    Math.max(
                        12,
                        Math.abs(value) * 8
                    )
                );


            fill.style.width =
                `${width}%`;

        }


        bar.appendChild(
            fill
        );


        cell.appendChild(
            number
        );

        cell.appendChild(
            score
        );

        cell.appendChild(
            bar
        );


        if (allowed) {

            cell.addEventListener(
                "pointerdown",
                () => {

                    selectDate(key);

                },
                {
                    passive: true
                }
            );

        }


        fragment.appendChild(
            cell
        );

    }


    calendar.replaceChildren(
        fragment
    );

}


/* =========================================================
   STATS
========================================================= */

function renderStats() {

    let total = 0;

    let positive = 0;

    let negative = 0;

    let active = 0;

    let bestValue =
        -Infinity;

    let bestKey =
        null;


    for (
        const key of RANGE_KEYS
    ) {

        const value =
            data[key] ?? 0;


        total += value;


        if (
            value > 0
        ) {

            positive += value;

        }


        if (
            value < 0
        ) {

            negative += value;

        }


        if (
            value !== 0
        ) {

            active++;

        }


        if (
            value > bestValue
        ) {

            bestValue =
                value;

            bestKey =
                key;

        }

    }


    totalScore.textContent =
        formatScore(total);


    positiveScore.textContent =
        `+${positive}`;


    negativeScore.textContent =
        String(negative);


    activeDays.textContent =
        String(active);


    if (
        bestKey &&
        bestValue > 0
    ) {

        bestDay.textContent =
            `+${bestValue}`;

        bestDay.title =
            bestKey;

    } else {

        bestDay.textContent =
            "—";

        bestDay.title =
            "";

    }


    /*
       기간 진행률
    */

    const today =
        new Date();


    const totalDays =
        RANGE_KEYS.length;


    let passedDays = 0;


    if (
        today < START
    ) {

        passedDays = 0;

    } else if (
        today > END
    ) {

        passedDays =
            totalDays;

    } else {

        passedDays =
            Math.floor(
                (
                    today - START
                ) / 86400000
            ) + 1;

    }


    const percent =
        Math.round(
            (
                passedDays /
                totalDays
            ) * 100
        );


    progressPercent.textContent =
        `${percent}%`;


    progressBar.style.width =
        `${percent}%`;


    /*
       설명
    */

    if (
        active === 0
    ) {

        totalDescription.textContent =
            "아직 기록이 없습니다.";

    } else {

        totalDescription.textContent =
            `${active}일 기록됨 · 현재 ${formatScore(total)}`;

    }


    /*
       문구
    */

    if (
        total > 0
    ) {

        quote.textContent =
            "좋은 기록이 조금씩 쌓이고 있다.";

    } else if (
        total < 0
    ) {

        quote.textContent =
            "마이너스도 기록이다. 다시 쌓으면 된다.";

    } else if (
        active > 0
    ) {

        quote.textContent =
            "플러스와 마이너스가 만나 현재는 0.";

    } else {

        quote.textContent =
            "작은 점수도 쌓이면 기록이 된다.";

    }

}


/* =========================================================
   RENDER
========================================================= */

function render() {

    renderCalendar();

    renderStats();

    if (
        selectedDate
    ) {

        updateEditor();

    }

}


/* =========================================================
   SELECT TODAY
========================================================= */

function selectToday() {

    const today =
        new Date();


    if (
        isAllowedDate(today)
    ) {

        selectedDate =
            dateKey(today);


        currentMonth =
            new Date(
                today.getFullYear(),
                today.getMonth(),
                1
            );

    } else {

        selectedDate =
            dateKey(START);

    }

}


/* =========================================================
   KEYBOARD
========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape" &&
            document.activeElement === valueInput
        ) {

            valueInput.blur();

        }

    }
);


/* =========================================================
   START
========================================================= */

async function init() {

    /*
       가장 먼저 화면을 만든다.
       서버 연결 여부와 관계없이
       사용자가 UI를 볼 수 있어야 한다.
    */

    data =
        normalize({});


    selectToday();

    render();


    /*
       그 다음 KeyVal 연결.
    */

    await load();


    /*
       1초마다 다른 기기 변경 확인.
    */

    setInterval(
        sync,
        100
    );

}


init();
