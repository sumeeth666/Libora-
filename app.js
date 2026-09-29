// =====================================================
// LIBORA - FRONTEND (Firestore database + QR check-in/extend)
// =====================================================

const TOTAL_SEATS = 50;
const ARRIVAL_MS = 10 * 60 * 1000;          // 10 min to reach the library
const ALLOWED_MINUTES = [15, 30, 45, 60, 120];
const QR_PREFIX = "LIBORA-SEAT-";           // what each seat's QR code encodes

const currentUser = () => localStorage.getItem("liboraUser");
let arrivalInterval = null;
let unsubscribeSeats = null;                // stops the realtime listener when leaving the page
let qrScanner = null;                       // the active Html5Qrcode instance, if scanning
let checkinMode = "arrival";                // "arrival" (first check-in) or "extend" (mid-study rescan)
let currentStudyEnd = null;                 // ms-since-epoch deadline the visible timer counts down to
let studyTimerInterval = null;

// A missing doc = available. Expired reservations / finished sessions count as available too.
function effectiveStatus(data, now) {
  if (!data) return "available";
  if (data.status === "reserved" && data.expiresAt < now) return "available";
  if (data.status === "occupied" && data.studyEndsAt < now) return "available";
  return data.status;
}

// =====================================================
// LOGIN
// =====================================================

document.addEventListener("DOMContentLoaded", function () {

    const loginForm = document.getElementById("loginForm");

    if (loginForm) {

        loginForm.addEventListener("submit", function (event) {

            event.preventDefault();

            const email = document.getElementById("email").value.trim().toLowerCase();
            const password = document.getElementById("password").value;

            if (email === "" || password === "") {
                alert("Please enter your email and password.");
                return;
            }

            // Get registered accounts
            const accounts =
                JSON.parse(localStorage.getItem("liboraAccounts")) || [];

            // Find matching account
            const account = accounts.find(function (user) {
                return user.email === email && user.password === password;
            });

            if (!account) {
                alert("Invalid email or password.");
                return;
            }

            // Login successful
            localStorage.setItem("liboraUser", account.email);
            localStorage.setItem("liboraUserName", account.name);

            alert("Login successful!");

            window.location.href = "dashboard.html";
        });
    }
        // DASHBOARD
    if (document.getElementById("seatGrid")) {

        if (!currentUser()) {
            window.location.href = "index.html";
            return;
        }

        loadDashboard();
    }


    // SEAT PAGE
    if (document.getElementById("selectedSeat")) {

        if (!currentUser()) {
            window.location.href = "index.html";
            return;
        }

        loadSeatPage();
    }

});

// =====================================================
// DASHBOARD  (realtime listener on the "seats" collection)
// =====================================================

function loadDashboard() {
    unsubscribeSeats = db.collection("seats").onSnapshot(function (snapshot) {
        const bySeat = {};
        snapshot.forEach((doc) => { bySeat[doc.id] = doc.data(); });

        const now = Date.now();
        const seats = [];
        for (let n = 1; n <= TOTAL_SEATS; n++) {
            seats.push({ number: n, status: effectiveStatus(bySeat[n], now) });
        }
        displaySeats(seats);
    }, function (err) {
        console.error("Could not load seats:", err);
    });
}

function displaySeats(seats) {
    const seatGrid = document.getElementById("seatGrid");
    seatGrid.innerHTML = "";

    seats.forEach(function (seat) {
        const button = document.createElement("button");
        button.textContent = seat.number;
        button.classList.add("seat");

        if (seat.status === "available") {
            button.classList.add("available");
            button.addEventListener("click", function () {
                reserveSeat(seat.number);
            });
        } else if (seat.status === "reserved") {
            button.classList.add("reserved");
            button.disabled = true;
        } else if (seat.status === "occupied") {
            button.classList.add("occupied");
            button.disabled = true;
        }

        seatGrid.appendChild(button);
    });

    updateSeatCounts(seats);
}

function updateSeatCounts(seats) {
    const count = (status) => seats.filter((s) => s.status === status).length;

    const available = document.getElementById("availableSeats");
    const reserved = document.getElementById("reservedSeats");
    const occupied = document.getElementById("occupiedSeats");

    if (available) available.textContent = count("available");
    if (reserved) reserved.textContent = count("reserved");
    if (occupied) occupied.textContent = count("occupied");
}

// =====================================================
// RESERVE SEAT  (Firestore transaction - no double-booking)
// =====================================================

async function reserveSeat(seatNumber) {
    if (!confirm("Do you want to reserve Seat " + seatNumber + "?")) return;

    const ref = db.collection("seats").doc(String(seatNumber));

    try {
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const now = Date.now();
            const data = snap.exists ? snap.data() : null;
            const free = effectiveStatus(data, now) === "available";

            if (!free) throw new Error("taken");

            tx.set(ref, {
                status: "reserved",
                userEmail: currentUser(),
                expiresAt: now + ARRIVAL_MS,
            });
        });
    } catch (err) {
        alert("That seat was just taken.");
        return;
    }

    localStorage.setItem("selectedSeat", seatNumber);
    localStorage.setItem("reservationStart", Date.now());

    alert("Seat " + seatNumber + " reserved successfully!\n\nYou have 10 minutes to reach the library.");
    window.location.href = "seat.html";
}

// =====================================================
// SEAT PAGE
// =====================================================

function loadSeatPage() {
    const seatNumber = localStorage.getItem("selectedSeat");

    if (!seatNumber) {
        alert("No seat has been selected.");
        window.location.href = "dashboard.html";
        return;
    }

    document.getElementById("selectedSeat").textContent = seatNumber;

    const label = document.getElementById("checkinSeatLabel");
    if (label) label.textContent = seatNumber;

    startArrivalCountdown();
}

// 10 MINUTE ARRIVAL COUNTDOWN
function startArrivalCountdown() {
    const timerElement = document.getElementById("arrivalTimer");
    const reservationStart = parseInt(localStorage.getItem("reservationStart"));
    if (!reservationStart) return;

    const endTime = reservationStart + 10 * 60 * 1000;

    function tick() {
        const remaining = endTime - Date.now();

        if (remaining <= 0) {
            clearInterval(arrivalInterval);
            timerElement.textContent = "00:00";
            stopQrScan();
            cancelReservation();
            return;
        }

        const totalSeconds = Math.floor(remaining / 1000);
        timerElement.textContent =
            String(Math.floor(totalSeconds / 60)).padStart(2, "0") + ":" +
            String(totalSeconds % 60).padStart(2, "0");
    }

    tick();
    arrivalInterval = setInterval(tick, 1000);
}

// =====================================================
// QR CHECK-IN + RESCAN  (proves physical presence: once to start
// studying, and again mid-study before allowing an extension)
// =====================================================

function startQrScan(mode) {
    checkinMode = mode || "arrival";

    const statusEl = document.getElementById("checkinStatus");
    const readerEl = document.getElementById("qr-reader");
    if (!readerEl) return;

    // the panel may be hidden from an earlier check-in - bring it back
    document.getElementById("qrCheckinSection").style.display = "block";
    document.getElementById("extendChoiceSection").style.display = "none";
    document.getElementById("startScanBtn").style.display = "none";

    const titleEl = document.getElementById("qrCheckinTitle");
    const instrEl = document.getElementById("qrCheckinInstructions");
    const seatNumber = localStorage.getItem("selectedSeat");

    if (checkinMode === "extend") {
        titleEl.textContent = "Scan Your Seat's QR Code";
        instrEl.textContent = "Scan again to extend your time or exit the seat.";
    } else {
        titleEl.textContent = "Scan the QR Code at Your Seat";
        instrEl.textContent = "Confirm you've reached Seat " + seatNumber + " by scanning the QR code stuck to it.";
    }

    statusEl.textContent = "Point your camera at the seat's QR code...";

    qrScanner = new Html5Qrcode("qr-reader");

    qrScanner
        .start(
            { facingMode: "environment" },       // rear camera on phones
            { fps: 10, qrbox: 220 },
            onScanDecoded,
            () => { /* per-frame "no QR found" - ignore, keep scanning */ }
        )
        .catch((err) => {
            statusEl.textContent =
                "Couldn't open the camera. Check camera permission, and make sure " +
                "you're on the live https:// site (camera doesn't work when the " +
                "page is opened as a local file).";
            console.error(err);
            document.getElementById("startScanBtn").style.display = "inline-block";
        });
}

function stopQrScan() {
    if (qrScanner) {
        qrScanner.stop().then(() => qrScanner.clear()).catch(() => {});
        qrScanner = null;
    }
}

function onScanDecoded(decodedText) {
    const statusEl = document.getElementById("checkinStatus");
    const reservedSeat = localStorage.getItem("selectedSeat");

    if (!decodedText.startsWith(QR_PREFIX)) {
        statusEl.textContent = "That's not a Libora seat code. Try again.";
        return;
    }

    const scannedSeat = decodedText.slice(QR_PREFIX.length);

    if (scannedSeat !== String(reservedSeat)) {
        statusEl.textContent =
            "That's Seat " + scannedSeat + ", but your seat is " + reservedSeat + ". " +
            "Scan the code at your own seat.";
        return;
    }

    // Correct seat scanned.
    stopQrScan();

    if (checkinMode === "extend") {
        statusEl.textContent = "";
        document.getElementById("qrCheckinSection").style.display = "none";
        document.getElementById("extendChoiceSection").style.display = "block";
        return;
    }

    // arrival mode: reveal the duration buttons for the first time
    clearInterval(arrivalInterval);          // they've reached the seat, stop the 10-min countdown
    statusEl.textContent = "Checked in!";
    document.getElementById("qrCheckinSection").style.display = "none";
    document.getElementById("studySelection").style.display = "block";
}

// =====================================================
// RELEASE SEAT
// =====================================================

async function releaseSeat() {
    const seatNumber = parseInt(localStorage.getItem("selectedSeat"));

    if (seatNumber) {
        try {
            const ref = db.collection("seats").doc(String(seatNumber));
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(ref);
                const data = snap.exists ? snap.data() : null;
                if (data && data.userEmail === currentUser()) {
                    tx.set(ref, { status: "available" });
                }
            });
        } catch (err) {
            console.error("Release failed:", err);
        }
    }

    clearInterval(studyTimerInterval);
    localStorage.removeItem("selectedSeat");
    localStorage.removeItem("reservationStart");
    localStorage.removeItem("studyEndTime");
    return seatNumber;
}

async function cancelReservation() {
    await releaseSeat();
    alert("Your 10-minute reservation has expired.\n\nThe seat is now available again.");
    window.location.href = "dashboard.html";
}

// =====================================================
// STUDY TIMER
// =====================================================

document.addEventListener("click", function (event) {
    if (event.target.classList.contains("time-btn") && event.target.dataset.time) {
        startStudyTime(parseInt(event.target.dataset.time));
    }
    if (event.target.classList.contains("extend-btn") && event.target.dataset.extend) {
        extendStudyTime(parseInt(event.target.dataset.extend));
    }
});

function tickStudyTimer() {
    const remaining = currentStudyEnd - Date.now();

    if (remaining <= 0) {
        clearInterval(studyTimerInterval);
        document.getElementById("studyTimer").textContent = "00:00:00";
        studyFinished();
        return;
    }

    const totalSeconds = Math.floor(remaining / 1000);
    document.getElementById("studyTimer").textContent =
        String(Math.floor(totalSeconds / 3600)).padStart(2, "0") + ":" +
        String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0") + ":" +
        String(totalSeconds % 60).padStart(2, "0");
}

async function startStudyTime(minutes) {
    const selection = document.getElementById("studySelection");
    const timerSection = document.getElementById("studyTimerSection");
    if (!selection || !timerSection) return;

    if (!confirm("Start your " + minutes + " minute study session?")) return;

    const seatNumber = parseInt(localStorage.getItem("selectedSeat"));
    const studyEndTime = Date.now() + minutes * 60 * 1000;

    try {
        const ref = db.collection("seats").doc(String(seatNumber));
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const data = snap.exists ? snap.data() : null;
            if (!data || data.userEmail !== currentUser()) {
                throw new Error("Your reservation is no longer active");
            }
            tx.set(ref, {
                status: "occupied",
                userEmail: currentUser(),
                studyEndsAt: studyEndTime,
            });
        });
    } catch (err) {
        alert(err.message || "Could not start study session");
        window.location.href = "dashboard.html";
        return;
    }

    selection.style.display = "none";
    timerSection.style.display = "block";

    localStorage.setItem("studyEndTime", studyEndTime);
    currentStudyEnd = studyEndTime;

    clearInterval(studyTimerInterval);
    tickStudyTimer();
    studyTimerInterval = setInterval(tickStudyTimer, 1000);
}

// >>> NEW: adds minutes on top of the CURRENT deadline (not from now),
// so "extend by 15" always means 15 more minutes of study time, however
// much time was already left when the person scanned in.
async function extendStudyTime(minutes) {
    const seatNumber = parseInt(localStorage.getItem("selectedSeat"));
    const ref = db.collection("seats").doc(String(seatNumber));
    let newEnd;

    try {
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const data = snap.exists ? snap.data() : null;
            if (!data || data.userEmail !== currentUser() || data.status !== "occupied") {
                throw new Error("Your session is no longer active");
            }
            newEnd = data.studyEndsAt + minutes * 60 * 1000;
            tx.set(ref, {
                status: "occupied",
                userEmail: currentUser(),
                studyEndsAt: newEnd,
            });
        });
    } catch (err) {
        alert(err.message || "Could not extend your session");
        return;
    }

    currentStudyEnd = newEnd;                // the running tickStudyTimer() picks this up next tick
    localStorage.setItem("studyEndTime", newEnd);

    document.getElementById("extendChoiceSection").style.display = "none";
    document.getElementById("extendOptions").style.display = "none";
    alert("Extended by " + minutes + " minutes.");
}

function showExtendOptions() {
    document.getElementById("extendOptions").style.display = "block";
}

function studyFinished() {
    alert("Your selected study time is complete!");

    document.getElementById("studyTimerSection").innerHTML = `
        <h2>Study Time Completed</h2>
        <p>Would you like to continue studying?</p>

        <button class="time-btn" data-time="15">
            <strong>15</strong>
            <span>Minutes</span>
        </button>

        <button class="time-btn" data-time="30">
            <strong>30</strong>
            <span>Minutes</span>
        </button>

        <br><br>

        <button class="exit-btn" onclick="exitSeat()">Exit</button>
    `;
}

async function exitSeat() {
    stopQrScan();
    const seatNumber = await releaseSeat();
    alert("You have exited the seat.\n\nSeat " + seatNumber + " is now available.");
    window.location.href = "dashboard.html";
}

function goBackToDashboard() {
    if (confirm("If you go back, your reservation will be cancelled. Continue?")) {
        stopQrScan();
        exitSeat();
    }
}

function logout() {
    localStorage.removeItem("liboraUser");
    window.location.href = "index.html";
}

// =====================================================
// LOGIN / REGISTER PAGE
// =====================================================

function showRegister() {

    document.getElementById("loginSection").style.display = "none";

    document.getElementById("registerSection").style.display = "block";
}


function showLogin() {

    document.getElementById("registerSection").style.display = "none";

    document.getElementById("loginSection").style.display = "block";
}


// =====================================================
// CREATE ACCOUNT
// =====================================================

document.addEventListener("DOMContentLoaded", function () {

    const registerForm = document.getElementById("registerForm");

    if (!registerForm) return;

    registerForm.addEventListener("submit", function (event) {

        event.preventDefault();

        const name =
            document.getElementById("registerName").value.trim();

        const email =
            document.getElementById("registerEmail").value.trim().toLowerCase();

        const password =
            document.getElementById("registerPassword").value;

        const confirmPassword =
            document.getElementById("confirmPassword").value;


        // Check passwords
        if (password !== confirmPassword) {

            alert("Passwords do not match.");

            return;
        }


        // Get existing accounts
        const accounts =
            JSON.parse(localStorage.getItem("liboraAccounts")) || [];


        // Check if email already exists
        const existingAccount = accounts.find(function (user) {

            return user.email === email;

        });


        if (existingAccount) {

            alert("An account with this email already exists.");

            return;
        }


        // Create new account
        const newAccount = {

            name: name,

            email: email,

            password: password

        };


        // Add account to accounts list
        accounts.push(newAccount);


        // Save accounts
        localStorage.setItem(
            "liboraAccounts",
            JSON.stringify(accounts)
        );


        alert("Account created successfully!");


        // Clear registration form
        registerForm.reset();


        // Return to login
        showLogin();

    });

});