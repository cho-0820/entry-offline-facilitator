/**
 * AI Facilitator Integrated Event Logger (Phase 1)
 * Schema: { sessionId, timestamp, type, payload }
 * Types: "block_change" | "run_start" | "error" | "ai_chat_input" | "block_suggestion"
 */

export type EventType = "block_change" | "run_start" | "error" | "ai_chat_input" | "block_suggestion";

export interface LogEvent {
    sessionId: string;
    timestamp: string; // ISO8601
    type: EventType;
    payload?: Record<string, any>;
}

// Excluded UI validation & alert keywords / keys (Not code execution or syntax errors)
const EXCLUDED_PATTERNS = [
    'can_not_space',
    'too_long',
    'add_object_alert',
    'shape_remove_fail',
    'sound_remove_fail',
    'variable_rename_failed',
    'list_rename_failed',
    'message_rename_failed',
    'local_variable_deletion_warning',
    'warning_function_aleady_being_edited',
    '빈 칸',
    '너무 깁니다',
    '삭제 실패',
    '추가해주세요',
    '모드 변환',
    '삭제될 수 있습니다',
    '빠져나와야 합니다',
];

/**
 * Filter out UI validation alerts and confirm dialogs.
 * Only return true for Syntax, Conversion, and Runtime Execution Errors.
 */
export function isCodeExecutionOrSyntaxError(title: string, message: string): boolean {
    const titleStr = String(title || '');
    const messageStr = String(message || '');
    const combined = `${titleStr} ${messageStr}`;
    
    for (const pattern of EXCLUDED_PATTERNS) {
        if (combined.includes(pattern)) {
            return false;
        }
    }
    return true;
}

/**
 * Phase 6 — Data Transmission Interface
 * Abstracts storage/uploading of logged events so that the backend destination
 * (e.g., local JSONL file, REST API server, WebSocket, etc.) can be swapped easily.
 */
export interface DataUploader {
    upload(event: LogEvent): Promise<void>;
    uploadBatch(events: LogEvent[]): Promise<void>;
}

/**
 * Default Local File Data Uploader Implementation
 * Persists event logs to local disk via Electron IPC (writeFile) and browser localStorage.
 */
export class LocalFileDataUploader implements DataUploader {
    async upload(event: LogEvent): Promise<void> {
        if (typeof window === 'undefined') {
            return;
        }
        (window as any).__ENTRY_EVENT_LOGS__ = (window as any).__ENTRY_EVENT_LOGS__ || [];
        (window as any).__ENTRY_EVENT_LOGS__.push(event);

        try {
            const recentLogs = (window as any).__ENTRY_EVENT_LOGS__.slice(-100);
            localStorage.setItem('entry_facilitator_logs', JSON.stringify(recentLogs));
        } catch (e) {
            // Ignore storage errors
        }

        try {
            if ((window as any).ipcInvoke) {
                const jsonlContent = '\uFEFF' + (window as any).__ENTRY_EVENT_LOGS__
                    .map((e: any) => JSON.stringify(e))
                    .join('\n') + '\n';
                const targetLogPath = 'C:\\Users\\ohmyg\\OneDrive\\Desktop\\AI facilitator\\secondary_data\\logs\\02_real_app_event_log.jsonl';
                (window as any).ipcInvoke('writeFile', jsonlContent, targetLogPath);
            }
        } catch (e) {
            // Ignore IPC errors
        }
    }

    async uploadBatch(events: LogEvent[]): Promise<void> {
        for (const event of events) {
            await this.upload(event);
        }
    }
}

/**
 * HTTP REST API Data Uploader Implementation
 * Uploads event logs directly to facilitator-api /api/logs endpoint in batch.
 */
export class HttpDataUploader implements DataUploader {
    async upload(event: LogEvent): Promise<void> {
        return this.uploadBatch([event]);
    }

    async uploadBatch(events: LogEvent[]): Promise<void> {
        if (typeof window === 'undefined' || !events || events.length === 0) {
            return;
        }

        // Dynamically read student_code on every upload call (handles shared devices)
        const studentCode = sessionStorage.getItem('student_code');
        if (!studentCode) {
            console.warn('[HttpDataUploader] Skipping log upload: student_code not found in sessionStorage.');
            return;
        }

        const apiUrl = process.env.FACILITATOR_API_URL
            ? process.env.FACILITATOR_API_URL.replace('/api/chat', '/api/logs')
            : 'https://facilitator-api.vercel.app/api/logs';

        const payload = {
            student_code: studentCode,
            session_id: events[0].sessionId,
            events: events.map((e) => ({
                type: e.type,
                timestamp: e.timestamp,
                payload: e.payload || {},
            })),
        };

        try {
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                console.warn(`[HttpDataUploader] Log upload responded with HTTP status ${res.status}`);
            } else {
                const data = await res.json();
                console.log(`[HttpDataUploader] Log upload successful (${events.length} event(s)):`, data);
            }
        } catch (err) {
            console.warn('[HttpDataUploader] Network error during log upload:', err);
        }
    }
}

class EventLogger {
    private sessionId: string;
    private logs: LogEvent[] = [];
    private initialized: boolean = false;
    private isNewProjectSession: boolean = true;
    private hasSentFirstChat: boolean = false;
    // Phase 4: run_start listener registry (avoids Entry event timing issues)
    private runStartListeners: Array<() => void> = [];
    
    // Phase 6: Data collection consent flag & pluggable uploader
    private enableDataCollection: boolean = false;
    private dataUploader: DataUploader = new HttpDataUploader();

    constructor() {
        this.sessionId = this.generateSessionId();
        // Load initial consent state from localStorage if available
        if (typeof window !== 'undefined') {
            const consent = localStorage.getItem('entry_facilitator_consent');
            this.enableDataCollection = consent === 'granted';
        }
    }

    public getIsDataCollectionEnabled(): boolean {
        return this.enableDataCollection;
    }

    public setDataCollectionEnabled(enabled: boolean): void {
        this.enableDataCollection = enabled;
        console.log(`[EventLogger] Data collection enabled state updated to: ${enabled}`);
    }

    public setDataUploader(uploader: DataUploader): void {
        this.dataUploader = uploader;
        console.log('[EventLogger] Custom DataUploader attached.');
    }

    private generateSessionId(): string {
        return 'session_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
    }

    public getSessionId(): string {
        return this.sessionId;
    }

    public startNewSession(isNewProject: boolean = true): string {
        this.sessionId = this.generateSessionId();
        this.isNewProjectSession = isNewProject;
        this.hasSentFirstChat = false;
        console.log(`[EventLogger] New session started: ${this.sessionId}, isNewProject=${isNewProject}`);
        return this.sessionId;
    }

    public resetSession(): string {
        return this.startNewSession(true);
    }

    public getIsNewProjectSession(): boolean {
        return this.isNewProjectSession;
    }

    public getHasSentFirstChat(): boolean {
        return this.hasSentFirstChat;
    }

    public markFirstChatSent(): void {
        this.hasSentFirstChat = true;
    }

    /**
     * Core logging method.
     * Note: Events are ALWAYS logged in-memory (this.logs) so that triggers operate correctly.
     * Disk/Server persistence occurs ONLY when enableDataCollection is true.
     */
    public log(type: EventType, payload?: Record<string, any>): LogEvent {
        const logEvent: LogEvent = {
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            type,
            payload: payload || {},
        };

        this.logs.push(logEvent);

        // 1. Output to browser console
        console.log(`[EventLogger][${logEvent.type}] (dataCollection=${this.enableDataCollection})`, logEvent);

        // 2. Persist to disk/server ONLY if data collection consent is granted
        if (this.enableDataCollection && this.dataUploader) {
            this.dataUploader.upload(logEvent).catch((err) => {
                console.warn('[EventLogger] DataUploader upload failed:', err);
            });
        }

        return logEvent;
    }

    public logBlockChange(payload?: Record<string, any>): LogEvent {
        return this.log('block_change', payload);
    }

    public logRunStart(payload?: Record<string, any>): LogEvent {
        const event = this.log('run_start', payload);
        // Notify all registered run_start listeners (Phase 4: Clarification Trigger)
        this.runStartListeners.forEach((fn) => fn());
        return event;
    }

    /**
     * Phase 4 — Register a callback to be called whenever run_start is logged.
     * Returns an unsubscribe function. This avoids relying on Entry.addEventListener
     * which may not be available at component mount time.
     */
    public addRunStartListener(cb: () => void): () => void {
        this.runStartListeners.push(cb);
        return () => {
            this.runStartListeners = this.runStartListeners.filter((fn) => fn !== cb);
        };
    }

    public logError(title: string, message: string, payload?: Record<string, any>): LogEvent | null {
        // Apply error category filtering rule
        if (!isCodeExecutionOrSyntaxError(title, message)) {
            console.log(`[EventLogger][Ignored UI Alert] title="${title}", message="${message}"`);
            return null;
        }

        const errorPayload = {
            title: title || '',
            message: message || '',
            ...payload,
        };

        return this.log('error', errorPayload);
    }

    public logAIChatInput(message: string, payload?: Record<string, any>): LogEvent {
        return this.log('ai_chat_input', { message, ...payload });
    }

    /**
     * Phase 4 — Clarification Trigger:
     * Called immediately after each mock assistant reply is generated.
     * The UI monitors block_change events from this timestamp until the next
     * run_start. If no meaningful changes occurred, the Clarification card fires.
     * Tracking is based on the LATEST block_suggestion (multiple rapid suggestions
     * use the last one as the window start).
     */
    public logBlockSuggestion(payload?: Record<string, any>): LogEvent {
        return this.log('block_suggestion', payload || {});
    }

    public getLogs(): LogEvent[] {
        return [...this.logs];
    }

    /**
     * Initialize listeners and monkey-patches for Entry.js events
     */
    public init(): void {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        if (typeof window === 'undefined' || !(window as any).Entry) {
            console.warn('[EventLogger] Entry object not available yet.');
            return;
        }

        const Entry = (window as any).Entry;

        // 1. Hook Entry.toast.alert for Error Logging
        if (Entry.toast && typeof Entry.toast.alert === 'function') {
            const originalAlert = Entry.toast.alert.bind(Entry.toast);
            Entry.toast.alert = (title: any, message: any, isBig?: boolean) => {
                this.logError(String(title || ''), String(message || ''));
                return originalAlert(title, message, isBig);
            };
            console.log('[EventLogger] Entry.toast.alert successfully wrapped.');
        }

        // 2. Hook Run Start Event
        if (typeof Entry.addEventListener === 'function') {
            Entry.addEventListener('run', () => {
                this.logRunStart();
            });
            console.log('[EventLogger] Entry "run" event listener attached.');
        }

        // 3. Hook Block Creation & Mutation Events via Entry.commander.doEvent
        const commander = Entry.commander || (Entry.Command && Entry.Command.commander);
        const doEvent = (commander && commander.doEvent) || (Entry.Command && Entry.Command.doEvent);

        if (doEvent && typeof doEvent.attach === 'function') {
            doEvent.attach(this, (commandType: any, args: any[]) => {
                let actionName = 'block_mutation';
                if (Entry.STATIC && typeof Entry.STATIC.getCommandName === 'function') {
                    actionName = Entry.STATIC.getCommandName(commandType) || String(commandType);
                } else if (typeof commandType === 'string') {
                    actionName = commandType;
                }

                // Whitelist meaningful block change actions and exclude simple drag movements (moveBlock)
                const MEANINGFUL_BLOCK_ACTIONS = [
                    'insertBlock',
                    'destroyBlock',
                    'destroyBlockBelow',
                    'destroyThreads',
                    'addThreadFromBlockMenu',
                    'setFieldValue',
                    'addBlock',
                    'separateBlock',
                    'cloneBlock',
                    'recoverBlock',
                ];

                if (!MEANINGFUL_BLOCK_ACTIONS.includes(actionName)) {
                    return;
                }

                let blockType = 'unknown';
                if (args && args.length > 0) {
                    const first = args[0] || args[1];
                    if (typeof first === 'string') {
                        blockType = first;
                    } else if (first && typeof first === 'object') {
                        blockType = first.type || (first.data && first.data.type) || (first.block && first.block.type) || 'unknown';
                    }
                }

                this.logBlockChange({
                    action: actionName,
                    blockType: blockType,
                });
            });
            console.log('[EventLogger] Entry.commander.doEvent successfully attached with action & blockType payload.');
        } else if (Entry.creationChangedEvent && typeof Entry.creationChangedEvent.attach === 'function') {
            Entry.creationChangedEvent.attach(this, () => {
                this.logBlockChange({ action: 'creationChanged', blockType: 'unknown' });
            });
            console.log('[EventLogger] Entry.creationChangedEvent attached as fallback.');
        }

        console.log(`[EventLogger] Initialized successfully. Session ID: ${this.sessionId}`);
    }
}

export const eventLogger = new EventLogger();
export default eventLogger;
