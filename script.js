/**
 * AccessVoice AI - Voice-Based Accessibility Assistant
 * Complete Client-Side Application Logic (HTML5 Web Speech API, Speech Synthesis, LocalStorage)
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize AccessVoice AI Application
    window.accessVoiceApp = new AccessVoiceApp();
});

class AccessVoiceApp {
    constructor() {
        // Application State
        this.settings = {
            contrast: 'normal',       // 'normal' | 'high'
            textSize: 'normal',       // 'small' | 'normal' | 'large' | 'xlarge'
            voiceSpeed: 1.0,          // 0.75 | 1.0 | 1.5
            voiceFeedback: true,      // boolean
            animations: true          // boolean
        };

        this.state = {
            status: 'ready',          // 'ready' | 'listening' | 'processing' | 'error' | 'speaking'
            isListening: false,
            isSpeaking: false,
            isReadingPage: false,
            isPageReaderPaused: false,
            lastUserSpeech: '',
            lastAssistantResponse: 'Hello! I am AccessVoice AI. How can I assist you today?',
            currentBlockIndex: 0
        };

        this.history = [];
        this.commandsTodayCount = 0;
        this.pageReadBlocks = [];
        this.voices = [];

        // Web Speech API Objects
        this.recognition = null;
        this.speechUtterance = null;
        this.pageReaderUtterance = null;

        // Init Sequence
        this.loadSettings();
        this.loadHistory();
        this.initDOMReferences();
        this.initSpeechRecognition();
        this.initSpeechSynthesis();
        this.initEventListeners();
        this.applySettingsToUI();
        this.renderHistoryTable();
        this.updateStatsCards();
    }

    /* --------------------------------------------------------------------------
       1. INITIALIZATION & LOCALSTORAGE MANAGEMENT
       -------------------------------------------------------------------------- */
    loadSettings() {
        try {
            const savedSettings = localStorage.getItem('accessvoice_settings');
            if (savedSettings) {
                this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
            }
        } catch (e) {
            console.error('Failed to load settings from LocalStorage', e);
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('accessvoice_settings', JSON.stringify(this.settings));
        } catch (e) {
            console.error('Failed to save settings to LocalStorage', e);
        }
        this.applySettingsToUI();
    }

    loadHistory() {
        try {
            const savedHistory = localStorage.getItem('accessvoice_history');
            if (savedHistory) {
                this.history = JSON.parse(savedHistory);
            }

            // Commands count today calculation
            const todayStr = new Date().toDateString();
            const savedDate = localStorage.getItem('accessvoice_date');
            if (savedDate === todayStr) {
                const count = localStorage.getItem('accessvoice_commands_today');
                this.commandsTodayCount = count ? parseInt(count, 10) : 0;
            } else {
                this.commandsTodayCount = 0;
                localStorage.setItem('accessvoice_date', todayStr);
                localStorage.setItem('accessvoice_commands_today', '0');
            }
        } catch (e) {
            console.error('Failed to load history from LocalStorage', e);
        }
    }

    saveHistory() {
        try {
            localStorage.setItem('accessvoice_history', JSON.stringify(this.history));
            localStorage.setItem('accessvoice_commands_today', this.commandsTodayCount.toString());
        } catch (e) {
            console.error('Failed to save history to LocalStorage', e);
        }
    }

    /* --------------------------------------------------------------------------
       2. DOM REFERENCES
       -------------------------------------------------------------------------- */
    initDOMReferences() {
        this.dom = {
            // Body & App
            body: document.body,
            srAnnouncer: document.getElementById('sr-announcer'),
            browserWarning: document.getElementById('browser-warning'),
            browserWarningText: document.getElementById('browser-warning-text'),
            
            // Header Quick Buttons
            contrastToggleBtn: document.getElementById('contrast-toggle-btn'),
            textSizeQuickBtn: document.getElementById('text-size-quick-btn'),
            textSizeLabel: document.getElementById('text-size-label'),
            emergencyBtn: document.getElementById('emergency-btn'),

            // Nav Tabs & Views
            tabs: document.querySelectorAll('.nav-tab'),
            views: document.querySelectorAll('.tab-view'),

            // Dashboard Controls & Display
            statusBadge: document.getElementById('status-badge'),
            statusIcon: document.getElementById('status-icon'),
            statusText: document.getElementById('status-text'),
            statCommandsCount: document.getElementById('stat-commands-count'),
            statContrastMode: document.getElementById('stat-contrast-mode'),
            statTextSize: document.getElementById('stat-text-size'),

            micBtn: document.getElementById('mic-btn'),
            micBtnIcon: document.getElementById('mic-btn-icon'),
            micActionText: document.getElementById('mic-action-text'),
            micRipple1: document.getElementById('mic-ripple-1'),
            micRipple2: document.getElementById('mic-ripple-2'),

            userSpeechText: document.getElementById('user-speech-text'),
            assistantSpeechText: document.getElementById('assistant-speech-text'),
            speakingVisualizer: document.getElementById('speaking-visualizer'),
            replayResponseBtn: document.getElementById('replay-response-btn'),
            stopSpeechBtn: document.getElementById('stop-speech-btn'),
            demoChipBtns: document.querySelectorAll('.demo-chip-btn'),

            // Page Reader Elements
            readerPlayBtn: document.getElementById('reader-play-btn'),
            readerPauseBtn: document.getElementById('reader-pause-btn'),
            readerResumeBtn: document.getElementById('reader-resume-btn'),
            readerStopBtn: document.getElementById('reader-stop-btn'),
            readerStatusBadge: document.getElementById('reader-status-badge'),
            speedOptionBtns: document.querySelectorAll('.speed-option-btn'),
            pageReaderContent: document.getElementById('page-reader-content'),

            // History Elements
            historySearchInput: document.getElementById('history-search-input'),
            historyTbody: document.getElementById('history-tbody'),
            historyEmptyMsg: document.getElementById('history-empty-msg'),
            clearHistoryBtn: document.getElementById('clear-history-btn'),

            // Settings Elements
            settingTextSize: document.getElementById('setting-text-size'),
            settingContrast: document.getElementById('setting-contrast'),
            settingVoiceSpeed: document.getElementById('setting-voice-speed'),
            settingVoiceFeedback: document.getElementById('setting-voice-feedback'),
            voiceFeedbackStatusText: document.getElementById('voice-feedback-status-text'),
            settingAnimations: document.getElementById('setting-animations'),
            animationsStatusText: document.getElementById('animations-status-text'),
            resetSettingsBtn: document.getElementById('reset-settings-btn'),

            // Help Commands Test Items
            helpCommandItems: document.querySelectorAll('.command-item'),

            // Emergency Modal
            emergencyModal: document.getElementById('emergency-modal'),
            closeEmergencyModalBtn: document.getElementById('close-emergency-modal-btn'),

            // Toast Container
            toastContainer: document.getElementById('toast-container')
        };
    }

    /* --------------------------------------------------------------------------
       3. SPEECH RECOGNITION (WEB SPEECH API)
       -------------------------------------------------------------------------- */
    initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            this.showBrowserWarning('Speech recognition API is not supported by your current browser. Voice input is disabled, but button controls work fully.');
            return;
        }

        try {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onstart = () => {
                this.state.isListening = true;
                this.updateStatus('listening', 'Listening...');
                this.dom.micBtn.classList.add('listening-active');
                this.dom.micBtn.parentElement.parentElement.classList.add('is-listening');
                this.dom.micActionText.innerHTML = '🎙️ Listening... Speak your command now';
                this.announceSR('Listening for voice command...');
            };

            this.recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }

                if (interimTranscript) {
                    this.dom.userSpeechText.innerHTML = `<em>"${interimTranscript}..."</em>`;
                }

                if (finalTranscript) {
                    this.state.lastUserSpeech = finalTranscript.trim();
                    this.dom.userSpeechText.innerHTML = `<strong>"${this.state.lastUserSpeech}"</strong>`;
                    this.processCommand(this.state.lastUserSpeech);
                }
            };

            this.recognition.onerror = (event) => {
                console.warn('Speech Recognition error:', event.error);
                this.state.isListening = false;
                this.dom.micBtn.classList.remove('listening-active');
                this.dom.micBtn.parentElement.parentElement.classList.remove('is-listening');

                if (event.error === 'no-speech') {
                    this.updateStatus('ready', 'Ready');
                    this.dom.micActionText.innerHTML = '🎙️ No speech detected. Click mic to try again';
                    this.showToast('No speech detected. Please try speaking again.');
                } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    this.updateStatus('error', 'Microphone Denied');
                    this.dom.micActionText.innerHTML = '🔴 Microphone permission denied';
                    this.showToast('Microphone access denied. Please check browser permissions.');
                    this.speak('Microphone access is required for voice commands. Please allow microphone permissions.');
                } else {
                    this.updateStatus('error', 'Error');
                    this.dom.micActionText.innerHTML = `🔴 Speech recognition error: ${event.error}`;
                }
            };

            this.recognition.onend = () => {
                this.state.isListening = false;
                this.dom.micBtn.classList.remove('listening-active');
                this.dom.micBtn.parentElement.parentElement.classList.remove('is-listening');
                if (this.state.status === 'listening') {
                    this.updateStatus('ready', 'Ready');
                    this.dom.micActionText.innerHTML = '🎙️ Click or Press Space to Speak';
                }
            };
        } catch (e) {
            console.error('Speech Recognition initialization error:', e);
            this.showBrowserWarning('Speech Recognition failed to initialize.');
        }
    }

    toggleListening() {
        if (!this.recognition) {
            this.showToast('Voice recognition is not available in this browser.');
            this.speak('Voice recognition is not supported in this browser.');
            return;
        }

        if (this.state.isSpeaking) {
            this.stopSpeaking();
        }

        if (this.state.isListening) {
            this.recognition.stop();
        } else {
            try {
                this.recognition.start();
            } catch (e) {
                console.warn('Recognition start exception:', e);
                this.recognition.stop();
                setTimeout(() => this.recognition.start(), 200);
            }
        }
    }

    /* --------------------------------------------------------------------------
       4. SPEECH SYNTHESIS (VOICE RESPONSE)
       -------------------------------------------------------------------------- */
    initSpeechSynthesis() {
        if ('speechSynthesis' in window) {
            const loadVoices = () => {
                this.voices = window.speechSynthesis.getVoices();
            };
            loadVoices();
            if (window.speechSynthesis.onvoiceschanged !== undefined) {
                window.speechSynthesis.onvoiceschanged = loadVoices;
            }
        }
    }

    speak(text, onEndCallback = null) {
        if (!this.settings.voiceFeedback) {
            if (onEndCallback) onEndCallback();
            return;
        }

        if (!('speechSynthesis' in window)) {
            if (onEndCallback) onEndCallback();
            return;
        }

        // Cancel existing speech
        window.speechSynthesis.cancel();

        this.speechUtterance = new SpeechSynthesisUtterance(text);
        this.speechUtterance.rate = parseFloat(this.settings.voiceSpeed);
        this.speechUtterance.volume = 1.0;
        this.speechUtterance.pitch = 1.0;

        // Choose a clean English voice if available
        if (this.voices.length > 0) {
            const englishVoice = this.voices.find(v => (v.lang.includes('en-US') || v.lang.includes('en-GB')) && v.name.includes('Natural')) ||
                                 this.voices.find(v => v.lang.includes('en'));
            if (englishVoice) {
                this.speechUtterance.voice = englishVoice;
            }
        }

        this.speechUtterance.onstart = () => {
            this.state.isSpeaking = true;
            this.updateStatus('speaking', 'Speaking...');
            this.dom.speakingVisualizer.classList.remove('hidden');
        };

        this.speechUtterance.onend = () => {
            this.state.isSpeaking = false;
            this.dom.speakingVisualizer.classList.add('hidden');
            if (this.state.status === 'speaking') {
                this.updateStatus('ready', 'Ready');
            }
            if (onEndCallback) onEndCallback();
        };

        this.speechUtterance.onerror = (e) => {
            console.warn('Speech synthesis error:', e);
            this.state.isSpeaking = false;
            this.dom.speakingVisualizer.classList.add('hidden');
            if (this.state.status === 'speaking') {
                this.updateStatus('ready', 'Ready');
            }
            if (onEndCallback) onEndCallback();
        };

        window.speechSynthesis.speak(this.speechUtterance);
    }

    stopSpeaking() {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        this.state.isSpeaking = false;
        this.dom.speakingVisualizer.classList.add('hidden');
        this.updateStatus('ready', 'Ready');
        this.stopPageReading();
    }

    /* --------------------------------------------------------------------------
       5. COMMAND PROCESSOR & KEYWORD MATCHING
       -------------------------------------------------------------------------- */
    processCommand(rawSpeech) {
        this.updateStatus('processing', 'Processing...');
        const input = rawSpeech.toLowerCase().trim();
        let responseMessage = '';
        let actionTaken = '';
        let statusTag = 'success';

        // 1. NAVIGATION COMMANDS
        if (input.includes('go home') || input.includes('home') || input.includes('dashboard') || input.includes('main page')) {
            this.switchTab('home');
            actionTaken = 'Navigated to Dashboard';
            responseMessage = 'Going to home dashboard.';

        } else if (input.includes('open settings') || input.includes('settings') || input.includes('go to settings')) {
            this.switchTab('settings');
            actionTaken = 'Opened Settings Panel';
            responseMessage = 'Opened accessibility settings.';

        } else if (input.includes('open help') || input.includes('help guide') || input.includes('show help') || input.includes('what can i say')) {
            this.switchTab('help');
            actionTaken = 'Opened Help Guide';
            responseMessage = 'Opened help and voice commands guide.';

        } else if (input.includes('show history') || input.includes('history') || input.includes('open history') || input.includes('command log')) {
            this.switchTab('history');
            actionTaken = 'Opened Command History';
            responseMessage = 'Opened voice command history.';

        } else if (input.includes('open reader') || input.includes('go to reader') || input.includes('read page view')) {
            this.switchTab('reader');
            actionTaken = 'Opened Page Reader View';
            responseMessage = 'Opened text-to-speech page reader.';

        // 2. ACCESSIBILITY COMMANDS
        } else if (input.includes('enable high contrast') || input.includes('turn on high contrast') || input.includes('high contrast mode')) {
            this.setContrastTheme('high');
            actionTaken = 'Accessibility Mode Enabled (High Contrast)';
            responseMessage = 'High contrast mode enabled.';

        } else if (input.includes('disable high contrast') || input.includes('turn off high contrast') || input.includes('normal contrast')) {
            this.setContrastTheme('normal');
            actionTaken = 'Accessibility Mode Disabled (High Contrast)';
            responseMessage = 'High contrast mode disabled.';

        } else if (input.includes('increase text size') || input.includes('make text bigger') || input.includes('larger text')) {
            const nextSize = this.getNextTextSize(1);
            this.setTextSize(nextSize);
            actionTaken = `Text Size Increased to ${nextSize.toUpperCase()}`;
            responseMessage = `Text size increased to ${nextSize}.`;

        } else if (input.includes('decrease text size') || input.includes('make text smaller') || input.includes('smaller text')) {
            const prevSize = this.getNextTextSize(-1);
            this.setTextSize(prevSize);
            actionTaken = `Text Size Decreased to ${prevSize.toUpperCase()}`;
            responseMessage = `Text size decreased to ${prevSize}.`;

        } else if (input.includes('enable large text') || input.includes('large text mode') || input.includes('large text')) {
            this.setTextSize('large');
            actionTaken = 'Text Size Set to Large';
            responseMessage = 'Large text mode enabled.';

        } else if (input.includes('disable large text') || input.includes('normal text')) {
            this.setTextSize('normal');
            actionTaken = 'Text Size Reset to Normal';
            responseMessage = 'Normal text size restored.';

        // 3. READING COMMANDS
        } else if (input.includes('read this page') || input.includes('read page') || input.includes('read article')) {
            this.switchTab('reader');
            actionTaken = 'Page Reading Started';
            responseMessage = 'Starting to read page content aloud.';
            setTimeout(() => this.startPageReading(), 800);

        } else if (input.includes('read the instructions') || input.includes('read instructions')) {
            actionTaken = 'Read Instructions Aloud';
            responseMessage = 'AccessVoice AI allows you to navigate this application, read text, adjust contrast, change font sizes, and view command history using voice commands. You can click the central microphone button or press the Space bar to speak.';

        } else if (input.includes('read my commands') || input.includes('read command history')) {
            actionTaken = 'Read Recent Voice Commands';
            if (this.history.length === 0) {
                responseMessage = 'Your voice command history is currently empty.';
            } else {
                const recent = this.history.slice(0, 3).map(h => h.command).join(', ');
                responseMessage = `Your recent spoken commands are: ${recent}.`;
            }

        } else if (input.includes('stop speaking') || input.includes('be quiet') || input.includes('silence') || input.includes('shut up')) {
            this.stopSpeaking();
            actionTaken = 'Speech Synthesis Stopped';
            responseMessage = 'Voice feedback stopped.';
            statusTag = 'info';

        // 4. ASSISTANT & UTILITY COMMANDS
        } else if (input.includes('what can you do') || input.includes('what can i say') || input.includes('what are your capabilities')) {
            actionTaken = 'Assistant Capabilities Queried';
            responseMessage = 'I can help you navigate this application, read text, change accessibility settings, and perform voice commands. Try saying: Go home, Open settings, Read this page, or Enable high contrast.';

        } else if (input.includes('hello') || input.includes('hi assistant') || input.includes('hey accessvoice') || input === 'hi') {
            actionTaken = 'Greeting Responded';
            responseMessage = 'Hello! How can I help you today? You can ask me to read this page, open settings, or change high contrast mode.';

        } else if (input.includes('repeat that') || input.includes('repeat last response')) {
            actionTaken = 'Repeated Last Response';
            responseMessage = this.state.lastAssistantResponse;

        } else if (input.includes('what time is it') || input.includes('tell me the time') || input.includes('current time')) {
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            actionTaken = 'Announced Current Time';
            responseMessage = `The current time is ${timeStr}.`;

        } else if (input.includes('clear history') || input.includes('delete history') || input.includes('wipe log')) {
            this.clearHistory();
            actionTaken = 'History Cleared';
            responseMessage = 'Voice command history has been cleared.';

        } else if (input.includes('emergency') || input.includes('emergency help') || input.includes('danger')) {
            this.triggerEmergencyHelp();
            actionTaken = 'Emergency Help Activated';
            responseMessage = 'Emergency assistance mode activated. Please contact your local emergency service if you are in immediate danger.';
            statusTag = 'warning';

        } else {
            // Unrecognized Fallback Command
            actionTaken = 'Command Unrecognized';
            statusTag = 'warning';
            responseMessage = `I did not recognize the command "${rawSpeech}". Try saying "What can you do?" or "Help".`;
        }

        // Display Assistant Speech Response
        this.state.lastAssistantResponse = responseMessage;
        this.dom.assistantSpeechText.innerText = `"${responseMessage}"`;

        // Speak Response
        this.speak(responseMessage);

        // Update Stats & History
        this.commandsTodayCount++;
        this.addHistoryRecord(rawSpeech, actionTaken, statusTag);
        this.updateStatsCards();
    }

    /* --------------------------------------------------------------------------
       6. TEXT-TO-SPEECH PAGE READER LOGIC
       -------------------------------------------------------------------------- */
    initPageReaderBlocks() {
        const blocks = this.dom.pageReaderContent.querySelectorAll('[data-read-block]');
        this.pageReadBlocks = Array.from(blocks);
    }

    startPageReading() {
        this.stopSpeaking();
        this.initPageReaderBlocks();

        if (this.pageReadBlocks.length === 0) {
            this.showToast('No readable text content found on this page.');
            return;
        }

        this.state.isReadingPage = true;
        this.state.isPageReaderPaused = false;
        this.state.currentBlockIndex = 0;

        this.dom.readerPlayBtn.classList.add('hidden');
        this.dom.readerPauseBtn.classList.remove('hidden');
        this.dom.readerPauseBtn.disabled = false;
        this.dom.readerResumeBtn.classList.add('hidden');
        this.dom.readerStopBtn.disabled = false;

        this.dom.readerStatusBadge.className = 'badge badge-active';
        this.dom.readerStatusBadge.innerText = 'Reading...';

        this.readNextBlock();
    }

    readNextBlock() {
        if (!this.state.isReadingPage || this.state.isPageReaderPaused) return;

        if (this.state.currentBlockIndex >= this.pageReadBlocks.length) {
            this.stopPageReading();
            this.speak('Finished reading the page.');
            return;
        }

        // Highlight active block
        this.pageReadBlocks.forEach(b => b.classList.remove('reading-highlight'));
        const currentBlock = this.pageReadBlocks[this.state.currentBlockIndex];
        currentBlock.classList.add('reading-highlight');
        currentBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const textToRead = currentBlock.innerText.trim();

        this.speak(textToRead, () => {
            if (this.state.isReadingPage && !this.state.isPageReaderPaused) {
                this.state.currentBlockIndex++;
                setTimeout(() => this.readNextBlock(), 300);
            }
        });
    }

    pausePageReading() {
        if (this.state.isReadingPage) {
            this.state.isPageReaderPaused = true;
            if ('speechSynthesis' in window) window.speechSynthesis.pause();
            this.dom.readerPauseBtn.classList.add('hidden');
            this.dom.readerResumeBtn.classList.remove('hidden');
            this.dom.readerStatusBadge.className = 'badge badge-neutral';
            this.dom.readerStatusBadge.innerText = 'Paused';
            this.showToast('Page reader paused.');
        }
    }

    resumePageReading() {
        if (this.state.isReadingPage && this.state.isPageReaderPaused) {
            this.state.isPageReaderPaused = false;
            if ('speechSynthesis' in window && window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            } else {
                this.readNextBlock();
            }
            this.dom.readerResumeBtn.classList.add('hidden');
            this.dom.readerPauseBtn.classList.remove('hidden');
            this.dom.readerStatusBadge.className = 'badge badge-active';
            this.dom.readerStatusBadge.innerText = 'Reading...';
        }
    }

    stopPageReading() {
        this.state.isReadingPage = false;
        this.state.isPageReaderPaused = false;
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();

        if (this.pageReadBlocks) {
            this.pageReadBlocks.forEach(b => b.classList.remove('reading-highlight'));
        }

        this.dom.readerPlayBtn.classList.remove('hidden');
        this.dom.readerPauseBtn.classList.add('hidden');
        this.dom.readerResumeBtn.classList.add('hidden');
        this.dom.readerStopBtn.disabled = true;
        this.dom.readerPauseBtn.disabled = true;

        this.dom.readerStatusBadge.className = 'badge badge-neutral';
        this.dom.readerStatusBadge.innerText = 'Stopped';
    }

    /* --------------------------------------------------------------------------
       7. UI HELPERS & ACCESSIBILITY TOGGLES
       -------------------------------------------------------------------------- */
    switchTab(tabId) {
        this.dom.tabs.forEach(tab => {
            const target = tab.getAttribute('aria-controls');
            if (target === `view-${tabId}`) {
                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
            } else {
                tab.classList.remove('active');
                tab.setAttribute('aria-selected', 'false');
            }
        });

        this.dom.views.forEach(view => {
            if (view.id === `view-${tabId}`) {
                view.classList.add('active');
            } else {
                view.classList.remove('active');
            }
        });

        this.announceSR(`Switched to ${tabId} panel.`);
    }

    setContrastTheme(theme) {
        this.settings.contrast = theme;
        if (theme === 'high') {
            this.dom.body.classList.add('theme-high-contrast');
            this.dom.contrastToggleBtn.setAttribute('aria-pressed', 'true');
        } else {
            this.dom.body.classList.remove('theme-high-contrast');
            this.dom.contrastToggleBtn.setAttribute('aria-pressed', 'false');
        }
        this.dom.settingContrast.value = theme;
        this.saveSettings();
        this.updateStatsCards();
    }

    setTextSize(size) {
        this.settings.textSize = size;
        this.dom.body.classList.remove('text-small', 'text-normal', 'text-large', 'text-xlarge');
        this.dom.body.classList.add(`text-${size}`);
        this.dom.settingTextSize.value = size;

        const capitalized = size.charAt(0).toUpperCase() + size.slice(1);
        this.dom.textSizeLabel.innerText = `Text: ${capitalized}`;
        this.saveSettings();
        this.updateStatsCards();
    }

    getNextTextSize(step) {
        const sizes = ['small', 'normal', 'large', 'xlarge'];
        let currentIndex = sizes.indexOf(this.settings.textSize);
        if (currentIndex === -1) currentIndex = 1;
        let newIndex = currentIndex + step;
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= sizes.length) newIndex = sizes.length - 1;
        return sizes[newIndex];
    }

    applySettingsToUI() {
        // Apply Contrast
        this.setContrastTheme(this.settings.contrast);

        // Apply Text Size
        this.setTextSize(this.settings.textSize);

        // Apply Voice Speed
        this.dom.settingVoiceSpeed.value = this.settings.voiceSpeed.toString();

        // Apply Voice Feedback
        this.dom.settingVoiceFeedback.checked = this.settings.voiceFeedback;
        this.dom.voiceFeedbackStatusText.innerText = this.settings.voiceFeedback ? 'ON' : 'OFF';

        // Apply Animations
        this.dom.settingAnimations.checked = this.settings.animations;
        this.dom.animationsStatusText.innerText = this.settings.animations ? 'ON' : 'OFF';
        if (this.settings.animations) {
            this.dom.body.classList.remove('no-animations');
        } else {
            this.dom.body.classList.add('no-animations');
        }
    }

    updateStatus(stateKey, statusText) {
        this.state.status = stateKey;
        this.dom.statusText.innerText = statusText;

        // Status badge color states
        this.dom.statusBadge.className = 'status-badge state-' + stateKey;
        
        // Icon mapping
        const icons = {
            ready: 'fa-check-circle',
            listening: 'fa-microphone',
            processing: 'fa-spinner fa-spin',
            speaking: 'fa-volume-high',
            error: 'fa-circle-exclamation'
        };

        this.dom.statusIcon.className = `fa-solid ${icons[stateKey] || 'fa-info-circle'}`;
    }

    updateStatsCards() {
        this.dom.statCommandsCount.innerText = this.commandsTodayCount.toString();
        this.dom.statContrastMode.innerText = this.settings.contrast === 'high' ? 'ON' : 'OFF';
        
        const sizeMap = { small: 'Small', normal: 'Normal', large: 'Large', xlarge: 'Extra Large' };
        this.dom.statTextSize.innerText = sizeMap[this.settings.textSize] || 'Normal';
    }

    /* --------------------------------------------------------------------------
       8. COMMAND HISTORY MANAGEMENT
       -------------------------------------------------------------------------- */
    addHistoryRecord(command, action, status) {
        const record = {
            id: Date.now(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            command: command,
            action: action,
            status: status
        };

        this.history.unshift(record);
        this.saveHistory();
        this.renderHistoryTable();
    }

    renderHistoryTable() {
        const query = this.dom.historySearchInput ? this.dom.historySearchInput.value.toLowerCase() : '';
        const filtered = this.history.filter(item => 
            item.command.toLowerCase().includes(query) || item.action.toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
            this.dom.historyTbody.innerHTML = '';
            this.dom.historyEmptyMsg.classList.remove('hidden');
            return;
        }

        this.dom.historyEmptyMsg.classList.add('hidden');
        this.dom.historyTbody.innerHTML = filtered.map(item => `
            <tr>
                <td><strong>${item.time}</strong></td>
                <td><code>"${this.escapeHTML(item.command)}"</code></td>
                <td>${this.escapeHTML(item.action)}</td>
                <td><span class="status-chip ${item.status}">${item.status.toUpperCase()}</span></td>
            </tr>
        `).join('');
    }

    clearHistory() {
        this.history = [];
        this.saveHistory();
        this.renderHistoryTable();
        this.showToast('Voice command history cleared.');
    }

    /* --------------------------------------------------------------------------
       9. EMERGENCY ASSISTANCE MODE
       -------------------------------------------------------------------------- */
    triggerEmergencyHelp() {
        this.dom.emergencyModal.classList.remove('hidden');
        this.dom.closeEmergencyModalBtn.focus();

        const msg = 'Emergency assistance mode has been activated. Please contact your local emergency service if you are in immediate danger.';
        this.speak(msg);
        this.announceSR(msg);
    }

    closeEmergencyModal() {
        this.dom.emergencyModal.classList.add('hidden');
        this.stopSpeaking();
    }

    /* --------------------------------------------------------------------------
       10. EVENT LISTENERS & KEYBOARD SHORTCUTS
       -------------------------------------------------------------------------- */
    initEventListeners() {
        // Quick Header Buttons
        this.dom.contrastToggleBtn.addEventListener('click', () => {
            const newTheme = this.settings.contrast === 'high' ? 'normal' : 'high';
            this.setContrastTheme(newTheme);
            const msg = newTheme === 'high' ? 'High contrast mode enabled.' : 'High contrast mode disabled.';
            this.speak(msg);
        });

        this.dom.textSizeQuickBtn.addEventListener('click', () => {
            const nextSize = this.getNextTextSize(1);
            this.setTextSize(nextSize);
            this.speak(`Text size set to ${nextSize}.`);
        });

        this.dom.emergencyBtn.addEventListener('click', () => this.triggerEmergencyHelp());
        this.dom.closeEmergencyModalBtn.addEventListener('click', () => this.closeEmergencyModal());

        // Navigation Tabs
        this.dom.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetViewId = tab.getAttribute('aria-controls').replace('view-', '');
                this.switchTab(targetViewId);
            });
        });

        // Hero Microphone Button
        this.dom.micBtn.addEventListener('click', () => this.toggleListening());

        // Speech Response Replay & Stop Buttons
        this.dom.replayResponseBtn.addEventListener('click', () => {
            this.speak(this.state.lastAssistantResponse);
        });

        this.dom.stopSpeechBtn.addEventListener('click', () => {
            this.stopSpeaking();
        });

        // Demo Chips (Quick Command Buttons)
        this.dom.demoChipBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.getAttribute('data-command');
                this.dom.userSpeechText.innerHTML = `<strong>"${cmd}"</strong>`;
                this.processCommand(cmd);
            });
        });

        // Page Reader Buttons
        this.dom.readerPlayBtn.addEventListener('click', () => this.startPageReading());
        this.dom.readerPauseBtn.addEventListener('click', () => this.pausePageReading());
        this.dom.readerResumeBtn.addEventListener('click', () => this.resumePageReading());
        this.dom.readerStopBtn.addEventListener('click', () => this.stopPageReading());

        // Page Reader Speed Toggles
        this.dom.speedOptionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.dom.speedOptionBtns.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-checked', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-checked', 'true');
                this.settings.voiceSpeed = parseFloat(btn.getAttribute('data-speed'));
                this.dom.settingVoiceSpeed.value = this.settings.voiceSpeed.toString();
                this.saveSettings();
                this.speak(`Reading speed set to ${btn.innerText}.`);
            });
        });

        // History Search & Clear
        if (this.dom.historySearchInput) {
            this.dom.historySearchInput.addEventListener('input', () => this.renderHistoryTable());
        }
        this.dom.clearHistoryBtn.addEventListener('click', () => this.clearHistory());

        // Settings Form Controls
        this.dom.settingTextSize.addEventListener('change', (e) => this.setTextSize(e.target.value));
        this.dom.settingContrast.addEventListener('change', (e) => this.setContrastTheme(e.target.value));
        
        this.dom.settingVoiceSpeed.addEventListener('change', (e) => {
            this.settings.voiceSpeed = parseFloat(e.target.value);
            this.saveSettings();
        });

        this.dom.settingVoiceFeedback.addEventListener('change', (e) => {
            this.settings.voiceFeedback = e.target.checked;
            this.dom.voiceFeedbackStatusText.innerText = e.target.checked ? 'ON' : 'OFF';
            this.saveSettings();
        });

        this.dom.settingAnimations.addEventListener('change', (e) => {
            this.settings.animations = e.target.checked;
            this.dom.animationsStatusText.innerText = e.target.checked ? 'ON' : 'OFF';
            this.saveSettings();
        });

        this.dom.resetSettingsBtn.addEventListener('click', () => {
            this.settings = { contrast: 'normal', textSize: 'normal', voiceSpeed: 1.0, voiceFeedback: true, animations: true };
            this.saveSettings();
            this.showToast('Settings reset to defaults.');
            this.speak('Settings reset to defaults.');
        });

        // Help Page Clickable Command Items
        this.dom.helpCommandItems.forEach(item => {
            item.addEventListener('click', () => {
                const cmd = item.getAttribute('data-test-cmd');
                if (cmd) {
                    this.dom.userSpeechText.innerHTML = `<strong>"${cmd}"</strong>`;
                    this.processCommand(cmd);
                }
            });
        });

        // Keyboard Navigation Shortcuts
        window.addEventListener('keydown', (e) => {
            // Space key toggles Mic (when not inside input / textarea / select)
            if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) {
                e.preventDefault();
                this.toggleListening();
            }

            // Alt + S toggles Mic anywhere
            if (e.altKey && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                this.toggleListening();
            }

            // Escape key cancels speech/listening and closes modal
            if (e.key === 'Escape') {
                this.stopSpeaking();
                if (this.state.isListening && this.recognition) {
                    this.recognition.stop();
                }
                if (!this.dom.emergencyModal.classList.contains('hidden')) {
                    this.closeEmergencyModal();
                }
            }
        });
    }

    /* --------------------------------------------------------------------------
       11. NOTIFICATIONS & ANNOUNCEMENTS
       -------------------------------------------------------------------------- */
    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<i class="fa-solid fa-circle-info" aria-hidden="true"></i> <span>${this.escapeHTML(message)}</span>`;
        this.dom.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    showBrowserWarning(msg) {
        this.dom.browserWarningText.innerText = msg;
        this.dom.browserWarning.classList.remove('hidden');
    }

    announceSR(text) {
        if (this.dom.srAnnouncer) {
            this.dom.srAnnouncer.innerText = text;
        }
    }

    escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
}
