// =====================================================
// LIBORA - COMPLETE FRONTEND JAVASCRIPT
// =====================================================


// =====================================================
// LOGIN
// =====================================================

document.addEventListener("DOMContentLoaded", function () {

    const loginForm = document.getElementById("loginForm");

    if (loginForm) {

        loginForm.addEventListener("submit", function (event) {

            event.preventDefault();

            const email =
                document.getElementById("email").value.trim();

            const password =
                document.getElementById("password").value.trim();


            if (email === "" || password === "") {

                alert("Please enter your email and password.");

                return;
            }


            // Temporary frontend login
            localStorage.setItem(
                "liboraUser",
                email
            );


            alert("Login successful!");


            window.location.href =
                "dashboard.html";

        });

    }


    // =================================================
    // DASHBOARD
    // =================================================

    const seatGrid =
        document.getElementById("seatGrid");


    if (seatGrid) {

        loadDashboard();

    }


    // =================================================
    // SEAT PAGE
    // =================================================

    const selectedSeatElement =
        document.getElementById("selectedSeat");


    if (selectedSeatElement) {

        loadSeatPage();

    }

});


// =====================================================
// DASHBOARD
// =====================================================

function loadDashboard() {

    const seatGrid =
        document.getElementById("seatGrid");


    let seats =
        JSON.parse(
            localStorage.getItem("liboraSeats")
        );


    // Create 50 seats first time
    if (!seats) {

        seats = [];

        for (let i = 1; i <= 50; i++) {

            seats.push({

                number: i,

                status: "available"

            });

        }


        localStorage.setItem(
            "liboraSeats",
            JSON.stringify(seats)
        );

    }


    displaySeats(seats);

}


// =====================================================
// DISPLAY SEATS
// =====================================================

function displaySeats(seats) {

    const seatGrid =
        document.getElementById("seatGrid");


    seatGrid.innerHTML = "";


    seats.forEach(function (seat) {

        const button =
            document.createElement("button");


        button.textContent =
            seat.number;


        button.classList.add("seat");


        if (seat.status === "available") {

            button.classList.add("available");


            button.addEventListener(
                "click",
                function () {

                    reserveSeat(seat.number);

                }
            );

        }


        else if (seat.status === "reserved") {

            button.classList.add("reserved");

            button.disabled = true;

        }


        else if (seat.status === "occupied") {

            button.classList.add("occupied");

            button.disabled = true;

        }


        seatGrid.appendChild(button);

    });


    updateSeatCounts(seats);

}


// =====================================================
// SEAT COUNTS
// =====================================================

function updateSeatCounts(seats) {

    const available =
        seats.filter(
            seat => seat.status === "available"
        ).length;


    const reserved =
        seats.filter(
            seat => seat.status === "reserved"
        ).length;


    const occupied =
        seats.filter(
            seat => seat.status === "occupied"
        ).length;


    const availableElement =
        document.getElementById("availableSeats");


    const reservedElement =
        document.getElementById("reservedSeats");


    const occupiedElement =
        document.getElementById("occupiedSeats");


    if (availableElement)
        availableElement.textContent = available;


    if (reservedElement)
        reservedElement.textContent = reserved;


    if (occupiedElement)
        occupiedElement.textContent = occupied;

}


// =====================================================
// RESERVE SEAT
// =====================================================

function reserveSeat(seatNumber) {

    const confirmBooking =
        confirm(
            "Do you want to reserve Seat " +
            seatNumber +
            "?"
        );


    if (!confirmBooking) {

        return;

    }


    let seats =
        JSON.parse(
            localStorage.getItem("liboraSeats")
        );


    const selectedSeat =
        seats.find(
            seat => seat.number === seatNumber
        );


    if (!selectedSeat) {

        alert("Seat not found.");

        return;

    }


    if (selectedSeat.status !== "available") {

        alert("This seat is no longer available.");

        return;

    }


    // Reserve seat
    selectedSeat.status = "reserved";


    localStorage.setItem(
        "liboraSeats",
        JSON.stringify(seats)
    );


    // Save selected seat
    localStorage.setItem(
        "selectedSeat",
        seatNumber
    );


    // Save reservation start time
    localStorage.setItem(
        "reservationStart",
        Date.now()
    );


    alert(
        "Seat " +
        seatNumber +
        " reserved successfully!\n\n" +
        "You have 10 minutes to reach the library."
    );


    window.location.href =
        "seat.html";

}


// =====================================================
// SEAT PAGE
// =====================================================

function loadSeatPage() {

    const seatNumber =
        localStorage.getItem("selectedSeat");


    const seatElement =
        document.getElementById("selectedSeat");


    if (!seatNumber) {

        alert("No seat has been selected.");

        window.location.href =
            "dashboard.html";

        return;

    }


    seatElement.textContent =
        seatNumber;


    startArrivalCountdown();

}


// =====================================================
// 10 MINUTE ARRIVAL COUNTDOWN
// =====================================================

function startArrivalCountdown() {

    const timerElement =
        document.getElementById("arrivalTimer");


    const reservationStart =
        parseInt(
            localStorage.getItem(
                "reservationStart"
            )
        );


    if (!reservationStart) {

        return;

    }


    const tenMinutes =
        10 * 60 * 1000;


    const endTime =
        reservationStart + tenMinutes;


    function updateArrivalTimer() {

        const remaining =
            endTime - Date.now();


        if (remaining <= 0) {

            timerElement.textContent =
                "00:00";


            cancelReservation();


            return;

        }


        const totalSeconds =
            Math.floor(
                remaining / 1000
            );


        const minutes =
            Math.floor(
                totalSeconds / 60
            );


        const seconds =
            totalSeconds % 60;


        timerElement.textContent =
            String(minutes).padStart(2, "0") +
            ":" +
            String(seconds).padStart(2, "0");

    }


    updateArrivalTimer();


    const interval =
        setInterval(function () {

            const remaining =
                endTime - Date.now();


            if (remaining <= 0) {

                clearInterval(interval);

                cancelReservation();

            }

            else {

                updateArrivalTimer();

            }

        }, 1000);

}


// =====================================================
// CANCEL RESERVATION AFTER 10 MINUTES
// =====================================================

function cancelReservation() {

    let seats =
        JSON.parse(
            localStorage.getItem("liboraSeats")
        );


    const seatNumber =
        parseInt(
            localStorage.getItem(
                "selectedSeat"
            )
        );


    if (seats && seatNumber) {

        const seat =
            seats.find(
                s => s.number === seatNumber
            );


        if (seat) {

            seat.status =
                "available";

        }


        localStorage.setItem(
            "liboraSeats",
            JSON.stringify(seats)
        );

    }


    alert(
        "Your 10-minute reservation has expired.\n\n" +
        "The seat is now available again."
    );


    localStorage.removeItem(
        "selectedSeat"
    );


    localStorage.removeItem(
        "reservationStart"
    );


    window.location.href =
        "dashboard.html";

}


// =====================================================
// STUDY TIME BUTTONS
// =====================================================

document.addEventListener(
    "click",
    function (event) {

        if (
            event.target.classList.contains(
                "time-btn"
            )
        ) {

            const minutes =
                parseInt(
                    event.target.dataset.time
                );


            startStudyTime(minutes);

        }

    }
);


// =====================================================
// START STUDY TIME
// =====================================================

function startStudyTime(minutes) {

    const selection =
        document.getElementById(
            "studySelection"
        );


    const timerSection =
        document.getElementById(
            "studyTimerSection"
        );


    if (!selection || !timerSection) {

        return;

    }


    const confirmed =
        confirm(
            "Start your " +
            minutes +
            " minute study session?"
        );


    if (!confirmed) {

        return;

    }


    // Hide choices
    selection.style.display =
        "none";


    // Show timer
    timerSection.style.display =
        "block";


    const studyEndTime =
        Date.now() +
        minutes * 60 * 1000;


    localStorage.setItem(
        "studyEndTime",
        studyEndTime
    );


    let timerInterval;


    function updateStudyTimer() {

        const remaining =
            studyEndTime - Date.now();


        if (remaining <= 0) {

            clearInterval(timerInterval);

            document.getElementById(
                "studyTimer"
            ).textContent =
                "00:00:00";


            studyFinished();


            return;

        }


        const totalSeconds =
            Math.floor(
                remaining / 1000
            );


        const hours =
            Math.floor(
                totalSeconds / 3600
            );


        const minutesLeft =
            Math.floor(
                (totalSeconds % 3600) / 60
            );


        const seconds =
            totalSeconds % 60;


        document.getElementById(
            "studyTimer"
        ).textContent =

            String(hours).padStart(2, "0") +
            ":" +

            String(minutesLeft).padStart(2, "0") +
            ":" +

            String(seconds).padStart(2, "0");

    }


    updateStudyTimer();


    timerInterval =
        setInterval(
            updateStudyTimer,
            1000
        );

}


// =====================================================
// STUDY FINISHED
// =====================================================

function studyFinished() {

    alert(
        "Your selected study time is complete!"
    );


    const timerSection =
        document.getElementById(
            "studyTimerSection"
        );


    timerSection.innerHTML = `

        <h2>Study Time Completed</h2>

        <p>Would you like to continue studying?</p>

        <button
            class="time-btn"
            data-time="15">

            <strong>15</strong>
            <span>Minutes</span>

        </button>


        <button
            class="time-btn"
            data-time="30">

            <strong>30</strong>
            <span>Minutes</span>

        </button>


        <br><br>

        <button
            class="exit-btn"
            onclick="exitSeat()">

            Exit

        </button>

    `;

}


// =====================================================
// EXIT SEAT
// =====================================================

function exitSeat() {

    let seats =
        JSON.parse(
            localStorage.getItem(
                "liboraSeats"
            )
        );


    const seatNumber =
        parseInt(
            localStorage.getItem(
                "selectedSeat"
            )
        );


    if (seats && seatNumber) {

        const seat =
            seats.find(
                s => s.number === seatNumber
            );


        if (seat) {

            seat.status =
                "available";

        }


        localStorage.setItem(
            "liboraSeats",
            JSON.stringify(seats)
        );

    }


    localStorage.removeItem(
        "selectedSeat"
    );


    localStorage.removeItem(
        "reservationStart"
    );


    localStorage.removeItem(
        "studyEndTime"
    );


    alert(
        "You have exited the seat.\n\n" +
        "Seat " +
        seatNumber +
        " is now available."
    );


    window.location.href =
        "dashboard.html";

}


// =====================================================
// BACK TO DASHBOARD
// =====================================================

function goBackToDashboard() {

    const answer =
        confirm(
            "If you go back, your reservation will be cancelled. Continue?"
        );


    if (answer) {

        exitSeat();

    }

}


// =====================================================
// LOGOUT
// =====================================================

function logout() {

    localStorage.removeItem(
        "liboraUser"
    );


    window.location.href =
        "index.html";

}