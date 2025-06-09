// ZMIANA: URL wskazuje teraz na serwer WebSocket na nowym porcie.
// Pamiętaj, aby na routerze przekierować zewnętrzny port (np. 8081) na wewnętrzny port 81 Twojego ESP.
const ESP_WS_URL = "ws://sterowanieesp12.duckdns.org:8081";

let ldrChart;
let socket;

document.addEventListener('DOMContentLoaded', () => {
    // Definicje haseł i kluczy
    const ADMIN_PASSWORD = "2sap1.8394";
    const PWD_STORAGE_KEY = 'inteligentneOswietlenie_Password';
    const DEFAULT_PASSWORD = "dom73";

    // Elementy UI
    const loginScreen = document.getElementById('loginScreen');
    const mainPanel = document.getElementById('mainPanel');
    const loginForm = document.getElementById('loginForm');
    const passwordInput = document.getElementById('loginPassword');
    const loginError = document.getElementById('loginError');

    let appInitialized = false;

    if (!localStorage.getItem(PWD_STORAGE_KEY)) {
        localStorage.setItem(PWD_STORAGE_KEY, DEFAULT_PASSWORD);
    }

    if (sessionStorage.getItem('isLoggedIn') === 'true') {
        showMainPanel();
        initializeMainApp();
    } else {
        showLoginScreen();
    }

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const enteredPassword = passwordInput.value;
        const currentPassword = localStorage.getItem(PWD_STORAGE_KEY);

        if (enteredPassword === ADMIN_PASSWORD) {
            const newPassword = prompt("Tryb administratora. Wprowadź nowe hasło dostępowe:", "");
            if (newPassword && newPassword.trim() !== "") {
                localStorage.setItem(PWD_STORAGE_KEY, newPassword);
                alert(`Hasło dostępowe zostało zmienione na: "${newPassword}"`);
                passwordInput.value = "";
            } else if (newPassword !== null) {
                alert("Hasło nie może być puste.");
            }
            return;
        }

        if (enteredPassword === currentPassword) {
            sessionStorage.setItem('isLoggedIn', 'true');
            showMainPanel();
            initializeMainApp();
        } 
        else {
            loginError.textContent = 'Błędne hasło!';
            passwordInput.value = '';
            const loginCard = document.querySelector('.login-card');
            loginCard.classList.add('shake-error');
            setTimeout(() => loginCard.classList.remove('shake-error'), 500);
        }
    });

    function showLoginScreen() {
        mainPanel.style.display = 'none';
        loginScreen.classList.add('show');
        passwordInput.focus();
    }

    function showMainPanel() {
        loginScreen.classList.remove('show');
        mainPanel.style.display = '';
        mainPanel.classList.add('fade-in');
    }

    function initializeMainApp() {
        if (appInitialized) return;
        appInitialized = true;
        initLdrChart();
        connectWebSocket();
    }
});


// --- NOWA LOGIKA WEBSOCKET ---

function connectWebSocket() {
    console.log("Łączenie z WebSocket...");
    const statusText = document.getElementById('ledStatus');
    if(statusText) statusText.innerText = 'Łączenie...';
    
    socket = new WebSocket(ESP_WS_URL);

    socket.onopen = () => {
        console.log("Połączono z WebSocket!");
        if(statusText) statusText.innerText = 'Połączono';
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // ZMIANA: Inteligentne kierowanie wiadomości
            if (data.action === 'new_log' && data.message) {
                // Jeśli to tylko nowy log, dodaj go płynnie do listy
                prependLog(data.message);
            } else {
                // W przeciwnym wypadku to pełna aktualizacja statusu
                updateUI(data);
            }
        } catch (error) {
            console.error("Błąd parsowania danych JSON z WebSocket:", error);
        }
    };

    socket.onclose = () => {
        console.log("Rozłączono WebSocket. Próba ponownego połączenia za 3 sekundy...");
        if(statusText) statusText.innerText = 'Błąd połączenia';
        setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (error) => {
        console.error("Błąd WebSocket:", error);
        if(statusText) statusText.innerText = 'Błąd połączenia';
        socket.close();
    };
}

function sendSocketMessage(payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
    } else {
        console.error("Nie można wysłać wiadomości, WebSocket nie jest połączony.");
        alert("Brak połączenia z urządzeniem. Spróbuj odświeżyć stronę.");
    }
}


function updateUI(data) {
    updateStatusWeatherPanel(data);
    updateLedControl(data.ledState, data.ledSource, data.timeRemaining);
    updateLdrPanel(data.ldrValue, data.ldrThresholdLow, data.ldrThresholdHigh, data.controlMode);
    
    // ZMIANA: Panel logów jest teraz aktualizowany tylko przy pierwszym połączeniu, gdy otrzymuje pełną historię
    if (data.logs) {
        updateLogs(data.logs);
    }
}

function initLdrChart() {
    const ctx = document.getElementById('ldrChart').getContext('2d');
    ldrChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [0, 1023],
                backgroundColor: ['rgb(106, 158, 255)', 'rgba(255, 255, 255, 0.08)'],
                borderColor: 'transparent',
                borderWidth: 0,
                circumference: 270,
                rotation: 225,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2,
            cutout: '80%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }
    });
}

function updateStatusWeatherPanel(data) {
    const { temperature, weatherId, weatherDescription, sunriseTime, sunsetTime, isPirActive, locationName } = data;
    
    document.getElementById('temperature').innerText = temperature ? `${Math.round(temperature)}°C` : '--°C';
    document.getElementById('weatherDescription').innerText = weatherDescription || 'Brak danych';
    document.getElementById('weatherIcon').className = getWeatherIconClass(weatherId);
    document.getElementById('sunrise').innerText = sunriseTime || 'N/A';
    document.getElementById('sunset').innerText = sunsetTime || 'N/A';
    document.getElementById('locationName').innerText = locationName || 'Brak lokalizacji';

    const pirStatus = document.getElementById('pirStatus');
    if (isPirActive) {
        pirStatus.innerHTML = `<i class="fa-solid fa-person-rays"></i> PIR jest Aktywny`;
        pirStatus.className = 'pir-status active';
    } else {
        pirStatus.innerHTML = `<i class="fa-solid fa-moon"></i> PIR jest Nieaktywny`;
        pirStatus.className = 'pir-status inactive';
    }
}

function updateLedControl(state, source, timeRemaining) {
    const statusText = document.getElementById('ledStatus');
    const timerText = document.getElementById('ledTimer');
    const progressBg = document.getElementById('ledProgressBg');
    const progressBar = document.getElementById('ledProgressBar');
    const ledCard = document.getElementById('ledControlCard');

    if (state) {
        ledCard.classList.add('card-active');
        statusText.innerText = `Oświetlenie Włączone`;
        if (timeRemaining > 0) {
            const totalDuration = (source === "WWW" ? 5 * 60 : (source === "Przycisk" ? 2 * 60 * 60 : 60));
            timerText.innerText = `Wyłączy się za ${Math.floor(timeRemaining / 60)}m ${String(timeRemaining % 60).padStart(2, '0')}s`;
            progressBar.style.width = `${Math.min(100, (timeRemaining / totalDuration) * 100)}%`;
            progressBg.style.visibility = 'visible';
            progressBg.style.opacity = '1';
        } else {
            timerText.innerText = `(Tryb: ${source})`;
            progressBg.style.visibility = 'hidden';
            progressBg.style.opacity = '0';
        }
    } else {
        ledCard.classList.remove('card-active');
        statusText.innerText = 'Oświetlenie Wyłączone';
        timerText.innerText = '';
        progressBg.style.visibility = 'hidden';
        progressBg.style.opacity = '0';
    }
}

function updateLdrPanel(ldrValue, low, high, controlMode) {
    if (ldrChart) {
        ldrChart.data.datasets[0].data = [ldrValue, 1023 - ldrValue];
        ldrChart.update('none');
    }
    document.getElementById('ldrValue').innerText = ldrValue;

    const ldrLowSlider = document.getElementById('ldrThresholdLowSlider');
    const ldrLowNum = document.getElementById('ldrThresholdLow');
    const ldrHighSlider = document.getElementById('ldrThresholdHighSlider');
    const ldrHighNum = document.getElementById('ldrThresholdHigh');

    if (document.activeElement !== ldrLowSlider) ldrLowSlider.value = low;
    if (document.activeElement !== ldrLowNum) ldrLowNum.value = low;
    if (document.activeElement !== ldrHighSlider) ldrHighSlider.value = high;
    if (document.activeElement !== ldrHighNum) ldrHighNum.value = high;

    document.getElementById('modeSelect').checked = (controlMode == 1);
}

// Funkcja pomocnicza do tworzenia pojedynczego elementu logu
function createLogElement(log) {
    const logIcons = { 'PIR': 'fa-person-rays', 'WWW': 'fa-globe', 'Przycisk': 'fa-hand-pointer', 'BTN': 'fa-hand-pointer', 'LDR': 'fa-gauge-high', 'TRYB': 'fa-gears', 'Wyłączony': 'fa-power-off', 'Błąd': 'fa-triangle-exclamation', 'ERR': 'fa-triangle-exclamation' };
    const logClasses = { 'PIR': 'pir', 'WWW': 'www', 'Przycisk': 'btn', 'BTN': 'btn', 'LDR': 'ldr', 'TRYB': 'mode', 'Błąd': 'error', 'ERR': 'error' };

    let iconClass = 'fa-solid fa-info-circle';
    let itemClass = 'log-item';
    for (const key in logIcons) { if (log.includes(key)) { iconClass = `fa-solid ${logIcons[key]}`; break; } }
    for (const key in logClasses) { if (log.includes(key)) { itemClass += ` ${logClasses[key]}`; break; } }
    
    const div = document.createElement('div');
    div.className = itemClass;
    div.innerHTML = `<i class="${iconClass}"></i><span>${log}</span>`;
    return div;
}

// NOWA FUNKCJA: Płynnie dodaje nowy log na górze listy
function prependLog(logMessage) {
    const logsList = document.getElementById('logsList');
    const MAX_UI_LOGS = 50;
    
    // Usuń wiadomość "Brak logów", jeśli istnieje
    const placeholder = logsList.querySelector('.log-item i.fa-inbox');
    if (placeholder) {
        placeholder.parentElement.remove();
    }

    const newLogElement = createLogElement(logMessage);
    logsList.prepend(newLogElement);

    // Pilnuj, aby lista logów nie była zbyt długa
    while (logsList.children.length > MAX_UI_LOGS) {
        logsList.lastChild.remove();
    }
}

// Ta funkcja jest teraz używana tylko do inicjalizacji panelu logów
function updateLogs(logs) {
    const logsList = document.getElementById('logsList');
    if (!logs || logs.length === 0) {
        logsList.innerHTML = `<div class="log-item"><i class="fa-solid fa-inbox"></i>Brak logów.</div>`;
        return;
    }
    
    logsList.innerHTML = logs.map(log => createLogElement(log).outerHTML).join('');
}


function getWeatherIconClass(weatherId) {
    if (!weatherId) return 'fa-solid fa-question-circle weather-icon';
    if (weatherId >= 200 && weatherId < 300) return 'fa-solid fa-cloud-bolt weather-icon';
    if (weatherId >= 300 && weatherId < 400) return 'fa-solid fa-cloud-drizzle weather-icon';
    if (weatherId >= 500 && weatherId < 600) return 'fa-solid fa-cloud-showers-heavy weather-icon';
    if (weatherId >= 600 && weatherId < 700) return 'fa-solid fa-snowflake weather-icon';
    if (weatherId >= 700 && weatherId < 800) return 'fa-solid fa-smog weather-icon';
    if (weatherId === 800) return 'fa-solid fa-sun weather-icon';
    if (weatherId === 801) return 'fa-solid fa-cloud-sun weather-icon';
    if (weatherId > 801) return 'fa-solid fa-cloud weather-icon';
    return 'fa-solid fa-question-circle weather-icon';
}

function toggleLed() { sendSocketMessage({ action: 'toggle_www' }); }
function resetLdrSettings() { if(confirm("Czy na pewno chcesz zresetować progi LDR do wartości domyślnych?")) sendSocketMessage({ action: 'reset_ldr' }); }
function setControlMode(mode) { sendSocketMessage({ action: 'set_control_mode', mode: mode }); }

const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

const updateLdrRange = debounce(() => {
    let low = document.getElementById('ldrThresholdLow').value;
    let high = document.getElementById('ldrThresholdHigh').value;
    sendSocketMessage({ action: 'set_ldr_threshold_range', low: parseInt(low), high: parseInt(high) });
}, 500);

function onRangeInputNum() {
    let low = parseInt(document.getElementById('ldrThresholdLow').value);
    let high = parseInt(document.getElementById('ldrThresholdHigh').value);
    if (low > high) [low, high] = [high, low];
    document.getElementById('ldrThresholdLowSlider').value = low;
    document.getElementById('ldrThresholdHighSlider').value = high;
    updateLdrRange();
}

function onRangeInputSliderLow() {
    let low = parseInt(document.getElementById('ldrThresholdLowSlider').value);
    let high = parseInt(document.getElementById('ldrThresholdHighSlider').value);
    if (low > high) {
        high = low;
        document.getElementById('ldrThresholdHighSlider').value = high;
    }
    document.getElementById('ldrThresholdLow').value = low;
    updateLdrRange();
}

function onRangeInputSliderHigh() {
    let low = parseInt(document.getElementById('ldrThresholdLowSlider').value);
    let high = parseInt(document.getElementById('ldrThresholdHighSlider').value);
    if (high < low) {
        low = high;
        document.getElementById('ldrThresholdLowSlider').value = low;
    }
    document.getElementById('ldrThresholdHigh').value = high;
    updateLdrRange();
}