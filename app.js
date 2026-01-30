const BadukClock = {
    state: {
        system: 'byoyomi',
        running: false,
        paused: false,
        activePlayer: null,
        gameOver: false,
        soundEnabled: true,
        theme: 'midnight',
        settings: {},
        players: {
            black: null,
            white: null
        },
    lastWarningSoundSecond: -1,
        utterance: null
    },

    audioContext: null,
    timerInterval: null,
    lastTick: null,

    elements: {},

    init() {
        this.cacheElements();
        this.bindEvents();
        this.loadSavedSettings();
        this.updateTimeSystemDisplay();
        this.showScreen('settings');
        this.registerServiceWorker();
        this.initAudio();
    },

    cacheElements() {
        this.elements = {
            clockScreen: document.getElementById('clock-screen'),
            settingsScreen: document.getElementById('settings-screen'),
            aboutScreen: document.getElementById('about-screen'),
            playerBlack: document.getElementById('player-black'),
            playerWhite: document.getElementById('player-white'),
            btnSettings: document.getElementById('btn-settings'),
            btnPause: document.getElementById('btn-pause'),
            btnReset: document.getElementById('btn-reset'),
            btnBack: document.getElementById('btn-back'),
            btnAbout: document.getElementById('btn-about'),
            btnAboutBack: document.getElementById('btn-about-back'),
            btnStartGame: document.getElementById('btn-start-game'),
            timeSystem: document.getElementById('time-system'),
            soundEnabled: document.getElementById('sound-enabled'),
            gameOverModal: document.getElementById('game-over-modal'),
            gameOverMessage: document.getElementById('game-over-message'),
            btnNewGame: document.getElementById('btn-new-game'),
            btnCloseModal: document.getElementById('btn-close-modal'),
            themeSelect: document.getElementById('theme-select'),
            settingName: document.getElementById('setting-name'),
            btnSaveSetting: document.getElementById('btn-save-setting'),
            savedSettingsList: document.getElementById('saved-settings-list'),
            installPrompt: document.getElementById('install-prompt'),
            btnInstall: document.getElementById('btn-install'),
            btnDismissInstall: document.getElementById('btn-dismiss-install')
        };
    },

    bindEvents() {
        this.elements.playerBlack.addEventListener('click', () => this.handlePlayerTap('black'));
        this.elements.playerWhite.addEventListener('click', () => this.handlePlayerTap('white'));
        
        this.elements.btnSettings.addEventListener('click', () => this.showScreen('settings'));
        this.elements.btnPause.addEventListener('click', () => this.togglePause());
        this.elements.btnReset.addEventListener('click', () => this.resetGame());
        
        this.elements.btnBack.addEventListener('click', () => this.showScreen('clock'));
        this.elements.btnStartGame.addEventListener('click', () => this.startGame());
        
        this.elements.btnAbout.addEventListener('click', () => this.showScreen('about'));
        this.elements.btnAboutBack.addEventListener('click', () => this.showScreen('settings'));
        
        this.elements.timeSystem.addEventListener('change', () => this.updateTimeSystemDisplay());
        this.elements.themeSelect.addEventListener('change', (e) => {
            this.setTheme(e.target.value);
        });
        this.elements.soundEnabled.addEventListener('change', (e) => {
            this.state.soundEnabled = e.target.checked;
            localStorage.setItem('badukClock_soundEnabled', this.state.soundEnabled);
        });
        
        this.elements.btnNewGame.addEventListener('click', () => {
            this.hideModal();
            this.showScreen('settings');
        });
        this.elements.btnCloseModal.addEventListener('click', () => this.hideModal());
        
        this.elements.btnSaveSetting.addEventListener('click', () => this.saveCurrentSetting());
        

        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            this.elements.installPrompt.classList.remove('hidden');
        });

        this.elements.btnInstall.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                deferredPrompt = null;
            }
            this.elements.installPrompt.classList.add('hidden');
        });

        this.elements.btnDismissInstall.addEventListener('click', () => {
            this.elements.installPrompt.classList.add('hidden');
        });

        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.state.running) {
                e.preventDefault();
                this.togglePause();
            }
        });
    },

    initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    },

    speak(text) {
        if (!this.state.soundEnabled || !window.speechSynthesis) return;

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        this.state.utterance = new SpeechSynthesisUtterance(text);
        this.state.utterance.lang = 'en-US';
        this.state.utterance.rate = 1.5;
        this.state.utterance.pitch = 1.0;
        window.speechSynthesis.speak(this.state.utterance);
    },

    playSound(type) {
        if (!this.state.soundEnabled || !this.audioContext) return;
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const now = this.audioContext.currentTime;

        switch (type) {
            case 'click': {
                // More "stone-like" click
                const osc = this.audioContext.createOscillator();
                const noise = this.audioContext.createBufferSource();
                const gain = this.audioContext.createGain();
                const filter = this.audioContext.createBiquadFilter();

                // Generate a tiny bit of noise for the "thud"
                const bufferSize = this.audioContext.sampleRate * 0.05;
                const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
                noise.buffer = buffer;

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(1000, now);
                filter.frequency.exponentialRampToValueAtTime(100, now + 0.05);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);

                osc.connect(gain);
                noise.connect(filter);
                filter.connect(gain);
                gain.connect(this.audioContext.destination);

                gain.gain.setValueAtTime(0.3, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

                osc.start(now);
                noise.start(now);
                osc.stop(now + 0.05);
                noise.stop(now + 0.05);
                break;
            }
            case 'tick': {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1200, now);
                osc.connect(gain);
                gain.connect(this.audioContext.destination);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.02);
                osc.start(now);
                osc.stop(now + 0.02);
                break;
            }
            case 'start': {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
                osc.connect(gain);
                gain.connect(this.audioContext.destination);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;
            }
            case 'pause': {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
                osc.connect(gain);
                gain.connect(this.audioContext.destination);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
            }
            case 'resume': {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(660, now);
                osc.frequency.exponentialRampToValueAtTime(990, now + 0.05);
                osc.connect(gain);
                gain.connect(this.audioContext.destination);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
            }
            case 'period': {
                const osc1 = this.audioContext.createOscillator();
                const osc2 = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(this.audioContext.destination);
                osc1.type = 'triangle';
                osc2.type = 'sine';
                osc1.frequency.value = 660;
                osc2.frequency.value = 880;
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 0.25);
                osc2.stop(now + 0.25);
                break;
            }
            case 'warning': {
                const osc = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc.connect(gain);
                gain.connect(this.audioContext.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(520, now);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.setValueAtTime(0.01, now + 0.1);
                gain.gain.setValueAtTime(0.25, now + 0.15);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
                osc.start(now);
                osc.stop(now + 0.25);
                break;
            }
            case 'critical': {
                const osc1 = this.audioContext.createOscillator();
                const osc2 = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(this.audioContext.destination);
                osc1.type = 'square';
                osc2.type = 'sawtooth';
                osc1.frequency.setValueAtTime(1200, now);
                osc2.frequency.setValueAtTime(1205, now);
                gain.gain.setValueAtTime(0.25, now);
                gain.gain.setValueAtTime(0.01, now + 0.05);
                gain.gain.setValueAtTime(0.25, now + 0.08);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 0.15);
                osc2.stop(now + 0.15);
                break;
            }
            case 'gameover': {
                const osc1 = this.audioContext.createOscillator();
                const osc2 = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(this.audioContext.destination);
                osc1.type = 'sawtooth';
                osc2.type = 'triangle';
                osc1.frequency.setValueAtTime(400, now);
                osc1.frequency.exponentialRampToValueAtTime(50, now + 1.0);
                osc2.frequency.setValueAtTime(300, now);
                osc2.frequency.exponentialRampToValueAtTime(40, now + 1.0);
                gain.gain.setValueAtTime(0.4, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 1.0);
                osc2.stop(now + 1.0);
                this.speak("Time is up!");
                break;
            }
        }
    },

    showScreen(screen) {
        this.elements.clockScreen.classList.remove('active');
        this.elements.settingsScreen.classList.remove('active');
        this.elements.aboutScreen.classList.remove('active');
        
        switch (screen) {
            case 'clock':
                this.elements.clockScreen.classList.add('active');
                break;
            case 'settings':
                this.elements.settingsScreen.classList.add('active');
                if (this.state.running) {
                    this.state.paused = true;
                    this.updatePauseButton();
                }
                break;
            case 'about':
                this.elements.aboutScreen.classList.add('active');
                break;
        }
    },

    updateTimeSystemDisplay() {
        const system = this.elements.timeSystem.value;
        document.querySelectorAll('.time-settings').forEach(el => el.classList.add('hidden'));
        document.getElementById(`${system}-settings`).classList.remove('hidden');
    },

    setTheme(theme) {
        this.state.theme = theme;
        document.body.setAttribute('data-theme', theme);
        this.elements.themeSelect.value = theme;
        localStorage.setItem('badukClock_theme', theme);
    },

    getSettings() {
        const system = this.elements.timeSystem.value;
        const settings = { system };

        switch (system) {
            case 'absolute':
                settings.absolute = {
                    totalTime: this.getTimeFromInputs('absolute-hours', 'absolute-minutes', 'absolute-seconds')
                };
                break;
            case 'byoyomi':
                settings.byoyomi = {
                    mainTime: this.getTimeFromInputs('byoyomi-main-hours', 'byoyomi-main-minutes', 'byoyomi-main-seconds'),
                    periods: parseInt(document.getElementById('byoyomi-periods').value) || 5,
                    periodTime: this.getTimeFromInputs(null, 'byoyomi-period-minutes', 'byoyomi-period-seconds')
                };
                break;
            case 'fischer':
                settings.fischer = {
                    initialTime: this.getTimeFromInputs('fischer-hours', 'fischer-minutes', 'fischer-seconds'),
                    increment: this.getTimeFromInputs(null, 'fischer-increment-minutes', 'fischer-increment-seconds'),
                    maxTime: this.getTimeFromInputs('fischer-max-hours', 'fischer-max-minutes', 'fischer-max-seconds')
                };
                break;
            case 'canadian':
                settings.canadian = {
                    mainTime: this.getTimeFromInputs('canadian-main-hours', 'canadian-main-minutes', 'canadian-main-seconds'),
                    periodTime: this.getTimeFromInputs(null, 'canadian-period-minutes', 'canadian-period-seconds'),
                    stones: parseInt(document.getElementById('canadian-stones').value) || 15
                };
                break;
            case 'simple':
                settings.simple = {
                    timePerMove: this.getTimeFromInputs(null, 'simple-minutes', 'simple-seconds')
                };
                break;
        }

        return settings;
    },

    getTimeFromInputs(hoursId, minutesId, secondsId) {
        const hours = hoursId ? parseInt(document.getElementById(hoursId).value) || 0 : 0;
        const minutes = parseInt(document.getElementById(minutesId).value) || 0;
        const seconds = parseInt(document.getElementById(secondsId).value) || 0;
        return hours * 3600 + minutes * 60 + seconds;
    },

    setSettingsToUI(settings) {
        this.elements.timeSystem.value = settings.system;
        this.updateTimeSystemDisplay();

        switch (settings.system) {
            case 'absolute':
                this.setTimeToInputs(settings.absolute.totalTime, 'absolute-hours', 'absolute-minutes', 'absolute-seconds');
                break;
            case 'byoyomi':
                this.setTimeToInputs(settings.byoyomi.mainTime, 'byoyomi-main-hours', 'byoyomi-main-minutes', 'byoyomi-main-seconds');
                document.getElementById('byoyomi-periods').value = settings.byoyomi.periods;
                this.setTimeToInputs(settings.byoyomi.periodTime, null, 'byoyomi-period-minutes', 'byoyomi-period-seconds');
                break;
            case 'fischer':
                this.setTimeToInputs(settings.fischer.initialTime, 'fischer-hours', 'fischer-minutes', 'fischer-seconds');
                this.setTimeToInputs(settings.fischer.increment, null, 'fischer-increment-minutes', 'fischer-increment-seconds');
                this.setTimeToInputs(settings.fischer.maxTime || 0, 'fischer-max-hours', 'fischer-max-minutes', 'fischer-max-seconds');
                break;
            case 'canadian':
                this.setTimeToInputs(settings.canadian.mainTime, 'canadian-main-hours', 'canadian-main-minutes', 'canadian-main-seconds');
                this.setTimeToInputs(settings.canadian.periodTime, null, 'canadian-period-minutes', 'canadian-period-seconds');
                document.getElementById('canadian-stones').value = settings.canadian.stones;
                break;
            case 'simple':
                this.setTimeToInputs(settings.simple.timePerMove, null, 'simple-minutes', 'simple-seconds');
                break;
        }
    },

    setTimeToInputs(totalSeconds, hoursId, minutesId, secondsId) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hoursId) document.getElementById(hoursId).value = hours;
        document.getElementById(minutesId).value = minutes;
        document.getElementById(secondsId).value = seconds;
    },

    startGame() {
        const settings = this.getSettings();
        this.state.settings = settings;
        this.state.system = settings.system;
        this.state.gameOver = false;
        this.state.running = true;
        this.state.paused = true;
        this.state.activePlayer = null;

        this.initializePlayers(settings);
        this.updateAllDisplays();
        this.showScreen('clock');
        this.updatePauseButton();

        this.elements.clockScreen.classList.remove('game-started');
        this.elements.playerBlack.classList.remove('active', 'warning', 'critical', 'lost');
        this.elements.playerWhite.classList.remove('active', 'warning', 'critical', 'lost');
    },

    initializePlayers(settings) {
        const createPlayer = () => {
            const player = {
                moves: 0,
                inOvertime: false
            };

            switch (settings.system) {
                case 'absolute':
                    player.time = settings.absolute.totalTime;
                    break;
                case 'byoyomi':
                    player.time = settings.byoyomi.mainTime;
                    player.periods = settings.byoyomi.periods;
                    player.periodTime = settings.byoyomi.periodTime;
                    player.currentPeriodTime = settings.byoyomi.periodTime;
                    break;
                case 'fischer':
                    player.time = settings.fischer.initialTime;
                    player.increment = settings.fischer.increment;
                    player.maxTime = settings.fischer.maxTime || 0;
                    break;
                case 'canadian':
                    player.time = settings.canadian.mainTime;
                    player.periodTime = settings.canadian.periodTime;
                    player.stones = settings.canadian.stones;
                    player.stonesRemaining = settings.canadian.stones;
                    player.overtimeTime = settings.canadian.periodTime;
                    break;
                case 'simple':
                    player.time = settings.simple.timePerMove;
                    player.timePerMove = settings.simple.timePerMove;
                    break;
            }

            return player;
        };

        this.state.players.black = createPlayer();
        this.state.players.white = createPlayer();
    },

    handlePlayerTap(player) {
        if (this.state.gameOver) return;

        if (!this.state.activePlayer) {
            this.playSound('start');
            this.state.activePlayer = 'black';
            this.state.paused = false;
            this.elements.clockScreen.classList.add('game-started');
            this.updatePauseButton();
            this.startTimer();
        } else if (this.state.activePlayer === player && !this.state.paused) {
            this.playSound('click');
            this.switchPlayer();
        }

        this.updateActivePlayerDisplay();
    },

    switchPlayer() {
        const currentPlayer = this.state.players[this.state.activePlayer];
        currentPlayer.moves++;

        switch (this.state.system) {
            case 'fischer':
                currentPlayer.time += currentPlayer.increment;
                if (currentPlayer.maxTime > 0 && currentPlayer.time > currentPlayer.maxTime) {
                    currentPlayer.time = currentPlayer.maxTime;
                }
                break;
            case 'byoyomi':
                if (currentPlayer.inOvertime) {
                    currentPlayer.currentPeriodTime = this.state.settings.byoyomi.periodTime;
                }
                break;
            case 'canadian':
                if (currentPlayer.inOvertime) {
                    currentPlayer.stonesRemaining--;
                    if (currentPlayer.stonesRemaining <= 0) {
                        currentPlayer.stonesRemaining = currentPlayer.stones;
                        currentPlayer.overtimeTime = currentPlayer.periodTime;
                    }
                }
                break;
            case 'simple':
                currentPlayer.time = currentPlayer.timePerMove;
                break;
        }

        this.state.activePlayer = this.state.activePlayer === 'black' ? 'white' : 'black';
        this.state.lastWarningSoundSecond = -1;
        this.updateAllDisplays();
    },

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        this.lastTick = Date.now();
        this.timerInterval = setInterval(() => this.tick(), 100);
    },

    tick() {
        if (this.state.paused || this.state.gameOver || !this.state.activePlayer) return;

        const player = this.state.players[this.state.activePlayer];
        if (!player) return;

        const now = Date.now();
        const elapsed = (now - this.lastTick) / 1000;
        this.lastTick = now;

        switch (this.state.system) {
            case 'absolute':
            case 'fischer':
                player.time -= elapsed;
                if (player.time <= 0) {
                    player.time = 0;
                    this.gameOver(this.state.activePlayer);
                }
                break;

            case 'byoyomi':
                if (!player.inOvertime) {
                    player.time -= elapsed;
                    if (player.time <= 0) {
                        player.time = 0;
                        player.inOvertime = true;
                        player.currentPeriodTime = player.periodTime;
                        this.playSound('period');
                    }
                } else {
                    player.currentPeriodTime -= elapsed;
                    if (player.currentPeriodTime <= 0) {
                        player.periods--;
                        if (player.periods <= 0) {
                            player.currentPeriodTime = 0;
                            this.gameOver(this.state.activePlayer);
                        } else {
                            player.currentPeriodTime = player.periodTime;
                            this.playSound('period');
                        }
                    }
                }
                break;

            case 'canadian':
                if (!player.inOvertime) {
                    player.time -= elapsed;
                    if (player.time <= 0) {
                        player.time = 0;
                        player.inOvertime = true;
                        player.overtimeTime = player.periodTime;
                        player.stonesRemaining = player.stones;
                        this.playSound('period');
                    }
                } else {
                    player.overtimeTime -= elapsed;
                    if (player.overtimeTime <= 0) {
                        player.overtimeTime = 0;
                        this.gameOver(this.state.activePlayer);
                    }
                }
                break;

            case 'simple':
                player.time -= elapsed;
                if (player.time <= 0) {
                    player.time = 0;
                    this.gameOver(this.state.activePlayer);
                }
                break;
        }

        this.updateDisplay(this.state.activePlayer);
        this.checkWarnings(this.state.activePlayer);
    },

    checkWarnings(playerColor) {
        const player = this.state.players[playerColor];
        if (!player) return;
        
        const element = playerColor === 'black' ? this.elements.playerBlack : this.elements.playerWhite;
        
        let timeToCheck;
        let isByoyomiOvertime = false;
        switch (this.state.system) {
            case 'byoyomi':
                timeToCheck = player.inOvertime ? player.currentPeriodTime : player.time;
                isByoyomiOvertime = player.inOvertime;
                break;
            case 'canadian':
                timeToCheck = player.inOvertime ? player.overtimeTime : player.time;
                break;
            default:
                timeToCheck = player.time;
        }

        element.classList.remove('warning', 'critical');
        
        if (this.state.activePlayer === playerColor) {
            // Use floor to match the integer part of the display
            const currentSecond = Math.floor(timeToCheck);
            
            if (timeToCheck <= 10.5) {
                element.classList.add('critical');
                if (currentSecond !== this.state.lastWarningSoundSecond && currentSecond >= 1) {
                    this.state.lastWarningSoundSecond = currentSecond;

                    if (isByoyomiOvertime && currentSecond <= 9) {
                        this.speak(currentSecond.toString());
                    } else if (currentSecond > 0) {
                        this.playSound('critical');
                    }
                }
            } else if (timeToCheck <= 30.5) {
                if (timeToCheck <= 20.5) element.classList.add('warning');

                if (currentSecond !== this.state.lastWarningSoundSecond && currentSecond > 0) {
                    this.state.lastWarningSoundSecond = currentSecond;

                    if (isByoyomiOvertime && (currentSecond === 30 || currentSecond === 20 || currentSecond === 10)) {
                        const text = currentSecond === 10 ? "10" : currentSecond.toString() + " seconds";
                        this.speak(text);
                    } else {
                        this.playSound('tick');
                    }
                }
            } else {
                this.state.lastWarningSoundSecond = -1;
            }
        }
    },

    gameOver(loser) {
        this.state.gameOver = true;
        this.state.running = false;
        if (this.timerInterval) clearInterval(this.timerInterval);

        const winner = loser === 'black' ? 'White' : 'Black';
        const loserElement = loser === 'black' ? this.elements.playerBlack : this.elements.playerWhite;
        
        loserElement.classList.add('lost');
        loserElement.classList.remove('warning', 'critical');

        this.elements.gameOverMessage.textContent = `${winner} wins on time!`;
        this.elements.gameOverModal.classList.remove('hidden');

        this.playSound('gameover');
    },

    hideModal() {
        this.elements.gameOverModal.classList.add('hidden');
    },

    togglePause() {
        if (!this.state.running || this.state.gameOver) return;
        
        this.state.paused = !this.state.paused;
        
        if (!this.state.paused) {
            this.playSound('resume');
            this.lastTick = Date.now();
            this.state.lastWarningSoundSecond = -1;
        } else {
            this.playSound('pause');
            if (window.speechSynthesis) window.speechSynthesis.cancel();
        }
        
        this.updatePauseButton();
        this.updateActivePlayerDisplay();
    },

    updatePauseButton() {
        const pauseIcon = this.elements.btnPause.querySelector('.icon-pause');
        const playIcon = this.elements.btnPause.querySelector('.icon-play');
        
        if (this.state.paused) {
            pauseIcon.classList.add('hidden');
            playIcon.classList.remove('hidden');
        } else {
            pauseIcon.classList.remove('hidden');
            playIcon.classList.add('hidden');
        }
    },

    resetGame() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        
        this.state.gameOver = false;
        this.state.running = false;
        this.state.paused = true;
        this.state.activePlayer = null;
        this.state.lastWarningSoundSecond = -1;

        this.elements.clockScreen.classList.remove('game-started');
        this.elements.playerBlack.classList.remove('active', 'warning', 'critical', 'lost');
        this.elements.playerWhite.classList.remove('active', 'warning', 'critical', 'lost');

        if (this.state.settings.system) {
            this.initializePlayers(this.state.settings);
            this.updateAllDisplays();
        }

        this.updatePauseButton();
    },

    updateActivePlayerDisplay() {
        this.elements.playerBlack.classList.remove('active');
        this.elements.playerWhite.classList.remove('active');

        if (this.state.activePlayer && !this.state.paused) {
            const element = this.state.activePlayer === 'black' ? 
                this.elements.playerBlack : this.elements.playerWhite;
            element.classList.add('active');
        }
    },

    updateAllDisplays() {
        this.updateDisplay('black');
        this.updateDisplay('white');
        this.updateActivePlayerDisplay();
    },

    updateDisplay(playerColor) {
        const player = this.state.players[playerColor];
        const element = playerColor === 'black' ? this.elements.playerBlack : this.elements.playerWhite;
        
        const mainTimeEl = element.querySelector('.main-time');
        const periodInfoEl = element.querySelector('.period-info');
        const timeModeEl = element.querySelector('.time-mode-label');
        const moveCountEl = element.querySelector('.move-count span');

        moveCountEl.textContent = player.moves;

        switch (this.state.system) {
            case 'absolute':
                timeModeEl.textContent = 'Absolute';
                mainTimeEl.textContent = this.formatTime(player.time);
                periodInfoEl.textContent = '';
                break;

            case 'byoyomi':
                timeModeEl.textContent = 'Byo-yomi';
                if (!player.inOvertime) {
                    mainTimeEl.textContent = this.formatTime(player.time);
                    periodInfoEl.textContent = `${player.periods} periods`;
                } else {
                    mainTimeEl.textContent = this.formatTime(player.currentPeriodTime);
                    periodInfoEl.textContent = `Period ${this.state.settings.byoyomi.periods - player.periods + 1}/${this.state.settings.byoyomi.periods}`;
                }
                break;

            case 'fischer':
                timeModeEl.textContent = 'Fischer';
                mainTimeEl.textContent = this.formatTime(player.time);
                periodInfoEl.textContent = `+${this.formatTime(player.increment)}/move`;
                break;

            case 'canadian':
                timeModeEl.textContent = 'Canadian';
                if (!player.inOvertime) {
                    mainTimeEl.textContent = this.formatTime(player.time);
                    periodInfoEl.textContent = '';
                } else {
                    mainTimeEl.textContent = this.formatTime(player.overtimeTime);
                    periodInfoEl.textContent = `${player.stonesRemaining}/${player.stones} stones`;
                }
                break;

            case 'simple':
                timeModeEl.textContent = 'Simple';
                mainTimeEl.textContent = this.formatTime(player.time);
                periodInfoEl.textContent = 'per move';
                break;
        }
    },

    formatTime(seconds) {
        if (seconds < 0) seconds = 0;
        
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const tenths = Math.floor((seconds * 10) % 10);

        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else if (seconds < 10) {
            return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
        } else {
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    },

    saveCurrentSetting() {
        const name = this.elements.settingName.value.trim();
        if (!name) return;

        const settings = this.getSettings();
        settings.name = name;

        let savedSettings = JSON.parse(localStorage.getItem('badukClock_savedSettings') || '[]');
        const existingIndex = savedSettings.findIndex(s => s.name === name);
        
        if (existingIndex >= 0) {
            savedSettings[existingIndex] = settings;
        } else {
            savedSettings.push(settings);
        }

        localStorage.setItem('badukClock_savedSettings', JSON.stringify(savedSettings));
        this.elements.settingName.value = '';
        this.renderSavedSettings();
    },

    loadSavedSettings() {
        const soundEnabled = localStorage.getItem('badukClock_soundEnabled');
        if (soundEnabled !== null) {
            this.state.soundEnabled = soundEnabled === 'true';
            this.elements.soundEnabled.checked = this.state.soundEnabled;
        }

        const savedTheme = localStorage.getItem('badukClock_theme');
        if (savedTheme) {
            this.setTheme(savedTheme);
        }

        this.renderSavedSettings();
    },

    renderSavedSettings() {
        const savedSettings = JSON.parse(localStorage.getItem('badukClock_savedSettings') || '[]');
        
        if (savedSettings.length === 0) {
            this.elements.savedSettingsList.innerHTML = '<p class="no-saved">No saved settings</p>';
            return;
        }

        this.elements.savedSettingsList.innerHTML = savedSettings.map((setting, index) => `
            <div class="saved-item">
                <div>
                    <div class="saved-item-name">${setting.name}</div>
                    <div class="saved-item-info">${this.getSettingDescription(setting)}</div>
                </div>
                <div class="saved-item-actions">
                    <button class="btn-load" data-index="${index}">Load</button>
                    <button class="btn-delete" data-index="${index}">Delete</button>
                </div>
            </div>
        `).join('');

        this.elements.savedSettingsList.querySelectorAll('.btn-load').forEach(btn => {
            btn.addEventListener('click', () => {
                const settings = savedSettings[parseInt(btn.dataset.index)];
                this.setSettingsToUI(settings);
            });
        });

        this.elements.savedSettingsList.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                savedSettings.splice(parseInt(btn.dataset.index), 1);
                localStorage.setItem('badukClock_savedSettings', JSON.stringify(savedSettings));
                this.renderSavedSettings();
            });
        });
    },

    getSettingDescription(setting) {
        switch (setting.system) {
            case 'absolute':
                return `Absolute: ${this.formatTime(setting.absolute.totalTime)}`;
            case 'byoyomi':
                return `Byo-yomi: ${this.formatTime(setting.byoyomi.mainTime)} + ${setting.byoyomi.periods}x${this.formatTime(setting.byoyomi.periodTime)}`;
            case 'fischer':
                return `Fischer: ${this.formatTime(setting.fischer.initialTime)} +${this.formatTime(setting.fischer.increment)}`;
            case 'canadian':
                return `Canadian: ${this.formatTime(setting.canadian.mainTime)} + ${this.formatTime(setting.canadian.periodTime)}/${setting.canadian.stones}`;
            case 'simple':
                return `Simple: ${this.formatTime(setting.simple.timePerMove)}/move`;
            default:
                return setting.system;
        }
    },

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('sw.js');
            } catch (e) {
                console.warn('Service worker registration failed:', e);
            }
        }
    }
};

document.addEventListener('DOMContentLoaded', () => BadukClock.init());
