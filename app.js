/* =========================================================
   DUOMARST DAILY SCORE
   Cross-device synchronization
========================================================= */


/* =========================
   CONFIG
========================= */

const KEY =
    "6b61bbfa-2a71-4b89-948f-b0d0c41a18f7";

const API =
    "https://api.keyval.org";


const START =
    new Date(2026, 8, 1);

const END =
    new Date(2027, 2, 31);


/* =========================
   STATE
========================= */

let data = {};

let selectedDate = null;

let currentMonth =
    new Date(
        2026,
        8,
        1
    );

let snapshot = "";


/* =========================
   ELEMENTS
========================= */

const $ = id =>
    document.getElementById(id);


/* =========================
   DATE
========================= */

function key(date) {

    return [
        date.getFullYear(),

        String(
            date.getMonth() + 1
        ).padStart(2, "0"),

        String(
            date.getDate()
        ).padStart(2, "0")

    ].join("-");
}


function sameDay(a, b) {

    return a &&
        b &&
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

}


function allowed(date) {

    return (
        date >= START &&
        date <= END
    );

}


/* =========================
   EMPTY DATABASE
========================= */

function emptyData() {

    const result = {};

    const date =
        new Date(START);


    while(date <= END) {

        result[key(date)] = 0;

        date.setDate(
            date.getDate() + 1
        );

    }


    return result;

}


/* =========================
   KEYVAL GET
========================= */

async function getRemote() {

    try {

        const response =
            await fetch(
                `${API}/get/${KEY}?t=${Date.now()}`
            );


        const text =
            await response.text();


        if(
            !text ||
            text === "null" ||
            text === "undefined"
        ) {

            return null;

        }


        try {

            return JSON.parse(text);

        } catch {

            try {

                return JSON.parse(
                    decodeURIComponent(text)
                );

            } catch {

                return null;

            }

        }

    } catch(error) {

        console.error(
            "KeyVal GET:",
            error
        );

        return null;

    }

}


/* =========================
   KEYVAL SAVE
========================= */

async function setRemote(value) {

    try {

        const encoded =
            encodeURIComponent(
                JSON.stringify(value)
            );


        const response =
            await fetch(
                `${API}/set/${KEY}/${encoded}`
            );


        return response.ok;

    } catch(error) {

        console.error(
            "KeyVal SET:",
            error
        );

        return false;

    }

}


/* =========================
   NORMALIZE
========================= */

function normalize(remote) {

    const result =
        emptyData();


    if(
        remote &&
        typeof remote === "object"
    ) {

        for(
            const date in remote
        ) {

            if(
                Object.prototype.hasOwnProperty
                    .call(result, date)
            ) {

                const value =
                    Number(remote[date]);


                result[date] =
                    Number.isFinite(value)
                        ? Math.trunc(value)
                        : 0;

            }

        }

    }


    return result;

}


/* =========================
   INITIAL LOAD
========================= */

async function load() {

    setSync("LOADING...");


    const remote =
        await getRemote();


    data =
        normalize(remote);


    snapshot =
        JSON.stringify(data);


    render();


    setSync("SYNCED");

}


/* =========================
   SYNC
========================= */

async function sync() {

    const remote =
        await getRemote();


    if(!remote) {

        return;

    }


    const normalized =
        normalize(remote);


    const remoteSnapshot =
        JSON.stringify(normalized);


    if(
        remoteSnapshot !== snapshot
    ) {

        data =
            normalized;

        snapshot =
            remoteSnapshot;

        render();

    }

}


/* =========================
   SAVE DATE
========================= */

async function saveDate() {

    if(!selectedDate) {

        return;

    }


    const dateKey =
        key(selectedDate);


    const value =
        Math.trunc(
            Number(
                $("valueInput").value
            ) || 0
        );


    setSync("SAVING...");


    /*
       다른 기기에서 방금 수정했을 가능성을
       줄이기 위해 저장 직전에 다시 읽는다.
    */

    const remote =
        await getRemote();


    const latest =
        normalize(remote);


    latest[dateKey] =
        value;


    const success =
        await setRemote(latest);


    if(success) {

        data =
            latest;

        snapshot =
            JSON.stringify(data);


        setSync("SYNCED");

        $("daySync").textContent =
            "SYNCED";

        $("footerStatus").textContent =
            "Saved";

        render();

    } else {

        setSync("ERROR");

        $("daySync").textContent =
            "ERROR";

        $("footerStatus").textContent =
            "Save failed";

    }

}


/* =========================
   SYNC UI
========================= */

function setSync(text) {

    $("syncText").textContent =
        text;

}


/* =========================
   CALENDAR
========================= */

const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
];


const weekdays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
];


function renderCalendar() {

    const calendar =
        $("calendar");


    calendar.innerHTML = "";


    const year =
        currentMonth.getFullYear();


    const month =
        currentMonth.getMonth();


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


    const days =
        last.getDate();


    $("monthTitle").textContent =
        `${months[month]} ${year}`;


    $("monthMeta").textContent =
        `${days} DAYS`;


    const values =
        Object.values(data)
            .map(Number)
            .map(Math.abs);


    const max =
        Math.max(
            1,
            ...values
        );


    for(
        let i = 0;
        i < 42;
        i++
    ) {

        const number =
            i - first.getDay() + 1;


        if(
            number < 1 ||
            number > days
        ) {

            const empty =
                document.createElement("div");

            empty.className =
                "day empty";

            calendar.appendChild(
                empty
            );

            continue;

        }


        const date =
            new Date(
                year,
                month,
                number
            );


        if(
            !allowed(date)
        ) {

            const empty =
                document.createElement("div");

            empty.className =
                "day empty";

            calendar.appendChild(
                empty
            );

            continue;

        }


        const dateKey =
            key(date);


        const value =
            Number(
                data[dateKey] || 0
            );


        const cell =
            document.createElement("div");


        cell.className =
            "day";


        if(
            sameDay(
                date,
                selectedDate
            )
        ) {

            cell.classList.add(
                "selected"
            );

        }


        if(
            sameDay(
                date,
                new Date()
            )
        ) {

            cell.classList.add(
                "today"
            );

        }


        if(value < 0) {

            cell.classList.add(
                "negative"
            );

        }


        const dayNumber =
            document.createElement("div");

        dayNumber.className =
            "day-number";

        dayNumber.textContent =
            number;


        const dayValue =
            document.createElement("div");

        dayValue.className =
            "day-value";


        if(value > 0) {

            dayValue.classList.add(
                "positive"
            );

            dayValue.textContent =
                `+${value}`;

        } else if(value < 0) {

            dayValue.classList.add(
                "negative"
            );

            dayValue.textContent =
                value;

        } else {

            dayValue.classList.add(
                "zero"
            );

            dayValue.textContent =
                "0";

        }


        const bar =
            document.createElement("div");

        bar.className =
            "day-bar";


        const fill =
            document.createElement("div");

        fill.className =
            "day-bar-fill";


        const percentage =
            Math.min(
                100,
                Math.abs(value) /
                max *
                100
            );


        fill.style.width =
            value === 0
                ? "0%"
                : `${Math.max(
                    8,
                    percentage
                )}%`;


        bar.appendChild(fill);


        cell.appendChild(
            dayNumber
        );

        cell.appendChild(
            dayValue
        );

        cell.appendChild(
            bar
        );


        if(
            sameDay(
                date,
                new Date()
            )
        ) {

            const dot =
                document.createElement("div");

            dot.className =
                "today-dot";

            cell.appendChild(dot);

        }


        cell.addEventListener(
            "click",
            () => selectDate(date)
        );


        calendar.appendChild(cell);

    }

}


/* =========================
   SELECT DATE
========================= */

function selectDate(date) {

    if(
        !allowed(date)
    ) {

        return;

    }


    selectedDate =
        new Date(date);


    const value =
        Number(
            data[key(date)] || 0
        );


    $("selectedDate").textContent =
        `${date.getFullYear()}.` +
        `${String(
            date.getMonth() + 1
        ).padStart(2, "0")}.` +
        `${String(
            date.getDate()
        ).padStart(2, "0")}`;


    $("selectedWeekday").textContent =
        weekdays[
            date.getDay()
        ];


    $("valueInput").value =
        value;


    updateEditor(value);


    renderCalendar();

}


/* =========================
   EDITOR
========================= */

function updateEditor(value) {

    const formatted =
        value > 0
            ? `+${value}`
            : value;


    $("bigValue").textContent =
        formatted;


    $("infoValue").textContent =
        formatted;


    $("status").textContent =
        value > 0
            ? "POSITIVE"
            : value < 0
                ? "NEGATIVE"
                : "ZERO";


    $("status").className =
        value > 0
            ? "positive"
            : value < 0
                ? "negative"
                : "";

}


function changeValue(amount) {

    const input =
        $("valueInput");


    const current =
        Number(input.value) || 0;


    const next =
        current + amount;


    input.value =
        next;


    updateEditor(next);

}


/* =========================
   EVENTS
========================= */

document.querySelectorAll(
    "[data-step]"
).forEach(button => {

    button.addEventListener(
        "click",
        () => {

            changeValue(
                Number(
                    button.dataset.step
                )
            );

        }
    );

});


$("minus").addEventListener(
    "click",
    () => changeValue(-1)
);


$("plus").addEventListener(
    "click",
    () => changeValue(1)
);


$("valueInput").addEventListener(
    "input",
    () => {

        updateEditor(
            Number(
                $("valueInput").value
            ) || 0
        );

    }
);


$("valueInput").addEventListener(
    "keydown",
    event => {

        if(
            event.key === "Enter"
        ) {

            saveDate();

        }

    }
);


$("save").addEventListener(
    "click",
    saveDate
);


$("reset").addEventListener(
    "click",
    () => {

        $("valueInput").value =
            0;

        updateEditor(0);

    }
);


/* =========================
   MONTH NAVIGATION
========================= */

function changeMonth(amount) {

    const next =
        new Date(
            currentMonth.getFullYear(),
            currentMonth.getMonth() + amount,
            1
        );


    const startMonth =
        new Date(
            START.getFullYear(),
            START.getMonth(),
            1
        );


    const endMonth =
        new Date(
            END.getFullYear(),
            END.getMonth(),
            1
        );


    if(
        next < startMonth ||
        next > endMonth
    ) {

        return;

    }


    currentMonth =
        next;


    renderCalendar();

}


$("prevMonth").addEventListener(
    "click",
    () => changeMonth(-1)
);


$("nextMonth").addEventListener(
    "click",
    () => changeMonth(1)
);


$("calendarPrev").addEventListener(
    "click",
    () => changeMonth(-1)
);


$("calendarNext").addEventListener(
    "click",
    () => changeMonth(1)
);


/* =========================
   STATISTICS
========================= */

function renderStats() {

    const values =
        Object.values(data)
            .map(Number);


    const total =
        values.reduce(
            (a,b) => a + b,
            0
        );


    const positive =
        values
            .filter(v => v > 0)
            .reduce(
                (a,b) => a + b,
                0
            );


    const negative =
        values
            .filter(v => v < 0)
            .reduce(
                (a,b) => a + b,
                0
            );


    const active =
        values.filter(
            v => v !== 0
        ).length;


    const best =
        Math.max(
            0,
            ...values
        );


    $("total").textContent =
        total > 0
            ? `+${total}`
            : total;


    $("positive").textContent =
        `+${positive}`;


    $("negative").textContent =
        negative;


    $("active").textContent =
        active;


    $("best").textContent =
        `+${best}`;


    const now =
        new Date();


    let progress =
        (
            now - START
        ) /
        (
            END - START
        ) *
        100;


    progress =
        Math.max(
            0,
            Math.min(
                100,
                progress
            )
        );


    $("progressBar").style.width =
        `${progress}%`;


    $("progressText").textContent =
        `${Math.round(progress)}%`;

}


/* =========================
   RENDER
========================= */

function render() {

    renderCalendar();

    renderStats();


    if(selectedDate) {

        const value =
            Number(
                data[key(selectedDate)] || 0
            );


        $("valueInput").value =
            value;


        updateEditor(value);

    }

}


/* =========================
   BACKGROUND NETWORK
========================= */

const canvas =
    $("background");


const ctx =
    canvas.getContext("2d");


let nodes = [];


function resize() {

    canvas.width =
        window.innerWidth *
        devicePixelRatio;


    canvas.height =
        window.innerHeight *
        devicePixelRatio;


    ctx.setTransform(
        devicePixelRatio,
        0,
        0,
        devicePixelRatio,
        0,
        0
    );


    createNodes();

}


function createNodes() {

    nodes = [];


    const count =
        Math.min(
            100,
            Math.max(
                40,
                Math.floor(
                    window.innerWidth / 15
                )
            )
        );


    for(
        let i = 0;
        i < count;
        i++
    ) {

        nodes.push({

            x:
                Math.random() *
                window.innerWidth,

            y:
                Math.random() *
                window.innerHeight,

            vx:
                (
                    Math.random() -
                    .5
                ) * .15,

            vy:
                (
                    Math.random() -
                    .5
                ) * .15,

            hue:
                Math.random()

        });

    }

}


function backgroundAnimation() {

    ctx.clearRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
    );


    /*
       부드러운 색광
    */

    const glow1 =
        ctx.createRadialGradient(
            window.innerWidth * .15,
            window.innerHeight * .2,
            0,
            window.innerWidth * .15,
            window.innerHeight * .2,
            500
        );


    glow1.addColorStop(
        0,
        "rgba(75,90,255,.10)"
    );


    glow1.addColorStop(
        1,
        "rgba(75,90,255,0)"
    );


    ctx.fillStyle =
        glow1;


    ctx.fillRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
    );


    const glow2 =
        ctx.createRadialGradient(
            window.innerWidth * .85,
            window.innerHeight * .35,
            0,
            window.innerWidth * .85,
            window.innerHeight * .35,
            520
        );


    glow2.addColorStop(
        0,
        "rgba(255,55,170,.09)"
    );


    glow2.addColorStop(
        1,
        "rgba(255,55,170,0)"
    );


    ctx.fillStyle =
        glow2;


    ctx.fillRect(
        0,
        0,
        window.innerWidth,
        window.innerHeight
    );


    /*
       움직이는 네트워크
    */

    for(
        const node of nodes
    ) {

        node.x += node.vx;
        node.y += node.vy;


        if(
            node.x < -50 ||
            node.x >
            window.innerWidth + 50
        ) {

            node.vx *= -1;

        }


        if(
            node.y < -50 ||
            node.y >
            window.innerHeight + 50
        ) {

            node.vy *= -1;

        }


        ctx.beginPath();

        ctx.arc(
            node.x,
            node.y,
            1.4,
            0,
            Math.PI * 2
        );


        ctx.fillStyle =
            node.hue > .5
                ? "rgba(90,210,255,.65)"
                : "rgba(210,90,255,.55)";


        ctx.fill();

    }


    for(
        let i = 0;
        i < nodes.length;
        i++
    ) {

        for(
            let j = i + 1;
            j < nodes.length;
            j++
        ) {

            const a =
                nodes[i];

            const b =
                nodes[j];


            const dx =
                a.x - b.x;

            const dy =
                a.y - b.y;


            const distance =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );


            if(
                distance < 130
            ) {

                const alpha =
                    .12 *
                    (
                        1 -
                        distance / 130
                    );


                ctx.beginPath();

                ctx.moveTo(
                    a.x,
                    a.y
                );

                ctx.lineTo(
                    b.x,
                    b.y
                );


                ctx.strokeStyle =
                    `rgba(150,120,255,${alpha})`;


                ctx.lineWidth =
                    .6;


                ctx.stroke();

            }

        }

    }


    requestAnimationFrame(
        backgroundAnimation
    );

}


window.addEventListener(
    "resize",
    resize
);


/* =========================
   START
========================= */

async function init() {

    resize();

    backgroundAnimation();


    /*
       현재 날짜를 기본 선택.
    */

    const today =
        new Date();


    if(
        allowed(today)
    ) {

        currentMonth =
            new Date(
                today.getFullYear(),
                today.getMonth(),
                1
            );


        selectedDate =
            new Date(today);

    } else {

        selectedDate =
            new Date(START);

    }


    await load();


    selectDate(
        selectedDate
    );


    /*
       모든 기기에서 변경사항을
       최대 1초 이내에 확인
    */

    setInterval(
        sync,
        1000
    );

}


init();
