// =====================================================
// LIBORA - LOCAL DATABASE SIMULATOR
// No Firebase / No Firestore / No backend
// =====================================================

const LOCAL_DB_KEY = "libora_local_seats";


// -----------------------------------------------------
// Load saved seats
// -----------------------------------------------------

function loadLocalSeats() {
    const saved = localStorage.getItem(LOCAL_DB_KEY);

    if (!saved) {
        return {};
    }

    try {
        return JSON.parse(saved);
    } catch (error) {
        console.error("Could not load local seats:", error);
        return {};
    }
}


// -----------------------------------------------------
// Save seats
// -----------------------------------------------------

function saveLocalSeats(seats) {
    localStorage.setItem(
        LOCAL_DB_KEY,
        JSON.stringify(seats)
    );
}


// -----------------------------------------------------
// Notify listeners
// -----------------------------------------------------

let localListeners = [];

function notifyLocalListeners() {

    const seats = loadLocalSeats();

    const snapshot = {

        forEach(callback) {

            Object.keys(seats).forEach(function (seatId) {

                callback({
                    id: seatId,

                    data() {
                        return seats[seatId];
                    }
                });

            });

        }

    };

    localListeners.forEach(function (listener) {
        listener(snapshot);
    });
}


// -----------------------------------------------------
// Local document reference
// -----------------------------------------------------

function createDocumentReference(seatId) {

    return {

        id: String(seatId),

        async get() {

            const seats = loadLocalSeats();

            const exists = Object.prototype.hasOwnProperty.call(
                seats,
                String(seatId)
            );

            return {

                exists: exists,

                data() {
                    return exists
                        ? seats[String(seatId)]
                        : null;
                }

            };

        }

    };

}


// -----------------------------------------------------
// Local Firestore-like database
// -----------------------------------------------------

const db = {

    collection(collectionName) {

        return {

            doc(seatId) {

                return createDocumentReference(seatId);

            },

            onSnapshot(callback, errorCallback) {

                try {

                    // Immediately send current data
                    notifySpecificListener(callback);

                    // Save listener
                    localListeners.push(callback);

                    // Return unsubscribe function
                    return function () {

                        localListeners =
                            localListeners.filter(
                                listener => listener !== callback
                            );

                    };

                } catch (error) {

                    if (errorCallback) {
                        errorCallback(error);
                    }

                }

            }

        };

    },


    async runTransaction(transactionFunction) {

        const transaction = {

            async get(ref) {

                return await ref.get();

            },

            set(ref, data) {

                const seats = loadLocalSeats();

                seats[String(ref.id)] = {
                    ...data
                };

                saveLocalSeats(seats);

            }

        };

        await transactionFunction(transaction);

        notifyLocalListeners();
    }

};


// -----------------------------------------------------
// Send snapshot to ONE listener
// -----------------------------------------------------

function notifySpecificListener(callback) {

    const seats = loadLocalSeats();

    const snapshot = {

        forEach(callbackForDocument) {

            Object.keys(seats).forEach(function (seatId) {

                callbackForDocument({

                    id: seatId,

                    data() {
                        return seats[seatId];
                    }

                });

            });

        }

    };

    callback(snapshot);
}


// -----------------------------------------------------
// Clean expired local reservations automatically
// -----------------------------------------------------

function cleanExpiredLocalSeats() {

    const seats = loadLocalSeats();

    const now = Date.now();

    let changed = false;

    Object.keys(seats).forEach(function (seatId) {

        const seat = seats[seatId];

        if (
            seat.status === "reserved" &&
            seat.expiresAt < now
        ) {

            delete seats[seatId];

            changed = true;

        }

        if (
            seat.status === "occupied" &&
            seat.studyEndsAt < now
        ) {

            delete seats[seatId];

            changed = true;

        }

    });


    if (changed) {

        saveLocalSeats(seats);

        notifyLocalListeners();

    }

}


// Check every second
setInterval(
    cleanExpiredLocalSeats,
    1000
);
