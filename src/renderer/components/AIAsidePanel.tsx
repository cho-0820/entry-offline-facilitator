import React, { useState, useEffect, useRef } from 'react';
import eventLogger from '../helper/logger/eventLogger';
import ipcRendererHelper from '../helper/ipcRendererHelper';

export type SenderType = 'user' | 'code_assistant' | 'facilitator';

export interface ChatMessage {
    id: string;
    sender: SenderType;
    text: string;
    timestamp: string;
    title?: string;
}

const renderMarkdown = (text: string) => {
    if (!text) return null;

    const parseInline = (str: string): React.ReactNode[] => {
        const parts = str.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, idx) => {
            if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
                return <strong key={idx}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];

    lines.forEach((line, lineIdx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const listContent = trimmed.substring(2);
            listItems.push(
                <li key={`li-${lineIdx}`} style={{ marginBottom: '3px' }}>
                    {parseInline(listContent)}
                </li>
            );
        } else {
            if (listItems.length > 0) {
                elements.push(
                    <ul key={`ul-${lineIdx}`} style={{ margin: '4px 0 6px 18px', paddingLeft: '0' }}>
                        {listItems}
                    </ul>
                );
                listItems = [];
            }
            if (trimmed.length > 0) {
                elements.push(
                    <div key={`p-${lineIdx}`} style={{ marginBottom: '4px', lineHeight: '1.45' }}>
                        {parseInline(line)}
                    </div>
                );
            }
        }
    });

    if (listItems.length > 0) {
        elements.push(
            <ul key={`ul-last`} style={{ margin: '4px 0 6px 18px', paddingLeft: '0' }}>
                {listItems}
            </ul>
        );
    }

    return <div>{elements}</div>;
};

/**
 * Phase 9: Programmatically insert code_json threads into the Entry canvas.
 * Preconditions enforced:
 *   1. Entry.container.isSceneObjectsExist() — 씬에 오브젝트 있어야 함
 *   2. Auto-select first scene object if none selected (Entry.container.selectObject)
 *   3. Each block gets Entry.generateHash() id before insertion
 *   4. Actual success is verified by threadCount delta on board.code
 */
function insertCodeJsonToCanvas(codeJson: any[]): { success: boolean; insertedCount: number; error?: string; isConditionFallback?: boolean } {
    try {
        const entryObj = (window as any).Entry;
        if (!entryObj) {
            return { success: false, insertedCount: 0, error: 'Entry 객체를 찾을 수 없습니다.' };
        }

        // ── 조건 분기(_if, if_else) 포함 여부 검사 헬퍼 ───────────────────
        const checkHasCondition = (block: any): boolean => {
            if (!block || typeof block !== 'object') return false;
            if (block.type === '_if' || block.type === 'if_else') return true;
            if (Array.isArray(block.params)) {
                for (const p of block.params) {
                    if (checkHasCondition(p)) return true;
                }
            }
            if (Array.isArray(block.statements)) {
                for (const branch of block.statements) {
                    if (Array.isArray(branch)) {
                        for (const child of branch) {
                            if (checkHasCondition(child)) return true;
                        }
                    }
                }
            }
            return false;
        };

        const hasCondition = Array.isArray(codeJson) && codeJson.some((th: any) => {
            if (Array.isArray(th)) {
                return th.some(checkHasCondition);
            }
            return checkHasCondition(th);
        });

        if (hasCondition) {
            console.log('[Phase10][CanvasInsert] Condition block detected. Skipping automatic canvas insertion as per user instructions.');
            return {
                success: false,
                insertedCount: 0,
                isConditionFallback: true,
                error: '이 코드는 조건문이 포함되어 있어 자동으로 넣기 어려워요. 아래 설명을 참고해서 블록 메뉴에서 직접 조립해볼까요?'
            };
        }

        // ── 전제조건 1: 씬에 오브젝트가 있는지 확인 ─────────────────────────
        const container = entryObj.container;
        if (!container || !container.isSceneObjectsExist()) {
            return {
                success: false,
                insertedCount: 0,
                error: '먼저 오브젝트를 하나 추가한 다음 다시 요청해주세요!',
            };
        }

        // ── 전제조건 2: 선택된 오브젝트가 없으면 첫 번째 오브젝트 자동 선택 ──
        const playground = entryObj.playground;
        if (!playground || !playground.object) {
            // getSceneObjects()는 현재 씬의 오브젝트 배열을 반환 (entry.js:872339)
            const sceneObjects = container.getSceneObjects ? container.getSceneObjects() : [];
            if (sceneObjects.length === 0) {
                return {
                    success: false,
                    insertedCount: 0,
                    error: '먼저 오브젝트를 하나 추가한 다음 다시 요청해주세요!',
                };
            }
            const firstObj = sceneObjects[0];
            console.log(`[Phase9] No object selected. Auto-selecting: "${firstObj.name}" (id=${firstObj.id})`);
            // container.selectObject(id) → playground.selectObject 를 거쳐 editor.board를 갱신함
            container.selectObject(firstObj.id);
        }

        // ── 전제조건 3: editor.board 유효성 확인 ────────────────────────────
        // Entry.Command.editor.board.code.createThread() 가 실제 삽입 로직 (entry.js:341757)
        const editor = entryObj.Command && entryObj.Command.editor;
        const board = editor && editor.board;
        const codeObj = board && board.code;

        if (!codeObj) {
            return {
                success: false,
                insertedCount: 0,
                error: '코드 편집 보드가 아직 초기화되지 않았습니다. 오브젝트를 클릭해서 코드 탭을 열어주세요.',
            };
        }

        // ── 삽입 전 threadCount 기록 (성공 검증 기준) ────────────────────────
        const beforeCount: number = typeof codeObj.getThreadCount === 'function'
            ? codeObj.getThreadCount()
            : (codeObj.getThreads ? codeObj.getThreads().length : 0);

        // ── 좌표 계산: 기존 블록과 겹치지 않도록 y 오프셋 산출 ──────────────
        let maxY = 40;
        if (codeObj.getThreads) {
            const existingThreads: any[] = codeObj.getThreads() || [];
            existingThreads.forEach((t: any) => {
                const first = t.getFirstBlock ? t.getFirstBlock() : null;
                if (first && typeof first.y === 'number') {
                    maxY = Math.max(maxY, first.y);
                }
            });
        }

        // ── code_json 형식 정규화 ──────────────────────────────────────────
        // Claude API가 반환하는 code_json은 두 가지 형태일 수 있음:
        //   A) 평면 배열 (1개 스레드):  [block1, block2, ...]
        //   B) 중첩 배열 (여러 스레드): [[block1, block2], [block3, ...], ...]
        // 첫 번째 원소가 배열이면 B, 오브젝트이면 A로 판정해서 통일
        const threads: any[][] = (codeJson.length > 0 && Array.isArray(codeJson[0]))
            ? codeJson as any[][]          // 형태 B: 이미 스레드 배열
            : [codeJson];                  // 형태 A: 평면 배열 → 단일 스레드로 감쌈

        console.log(`[Phase9] Normalized to ${threads.length} thread(s). Format was: ${Array.isArray(codeJson[0]) ? 'nested [[...]]' : 'flat [...]'}`);

        // ── 변수 생성 헬퍼: Entry.do('variableContainerAddVariable', ...) 대신
        //    variableContainer.addVariable() 직접 호출
        //    (Entry.do의 커맨드 이름 오타/누락이 함수 생성 등 엉뚱한 동작을 유발하므로 우회)
        const createEntryVariable = (varName: string): boolean => {
            try {
                const vc = entryObj.variableContainer;
                if (!vc) return false;
                // 이미 있으면 스킵
                const existing = vc.getVariable ? vc.getVariable(varName) : null;
                if (existing) return false;

                // Entry.Variable 인스턴스 생성
                const id = entryObj.generateHash ? entryObj.generateHash() : Math.random().toString(36).slice(2, 10);
                const varData = { id, name: varName, value: 0, type: 'variable', object: null, visible: true };
                let variable: any = null;
                if (entryObj.Variable) {
                    variable = new entryObj.Variable(varData);
                } else if (typeof Entry !== 'undefined' && (Entry as any).Variable) {
                    variable = new (Entry as any).Variable(varData);
                }
                if (!variable) return false;

                // variableContainer.addVariable() 직접 호출
                if (vc.addVariable) {
                    vc.addVariable(variable);
                    if (vc.updateList) vc.updateList();
                    console.log(`[VariableCreate] Created variable: "${varName}" (id: ${id})`);
                    return true;
                }
                return false;
            } catch (e) {
                console.warn(`[VariableCreate] Failed to create variable "${varName}":`, e);
                return false;
            }
        };

        // ── COMMAND_TYPES 검증 포함 안전한 Entry.do wrapper ────────────────
        //    존재하지 않는 커맨드 이름 사용 시 즉시 에러를 남기고 중단합니다.
        const VALID_ENTRY_COMMANDS = new Set([
            // COMMAND_TYPES_ALWAYS (block, scene, playground)
            'sceneAdd', 'sceneRemove', 'sceneRename', 'sceneSort', 'sceneSelect',
            'addThread', 'destroyThread', 'destroyBlock', 'recoverBlock', 'insertBlock',
            'separateBlock', 'moveBlock', 'cloneBlock', 'uncloneBlock', 'scrollBoard',
            'setFieldValue', 'selectBlockMenu', 'destroyBlockBelow', 'destroyThreads',
            'addThreads', 'recoverBlockBelow', 'addThreadFromBlockMenu', 'insertBlockFromBlockMenu',
            'moveBlockFromBlockMenu', 'separateBlockForDestroy', 'moveBlockForDestroy',
            'insertBlockFromBlockMenuFollowSeparate', 'insertBlockFollowSeparate',
            'separateBlockByCommand',
            // Object
            'selectObject', 'objectEditButtonClick', 'objectAddPicture', 'objectRemovePicture',
            'objectAddSound', 'objectRemoveSound', 'objectNameEdit', 'addObject', 'removeObject',
            'objectUpdatePosX', 'objectUpdatePosY', 'objectUpdateSize', 'objectUpdateRotationValue',
            'objectUpdateDirectionValue', 'objectUpdateRotateMethod', 'entitySetModel',
            'objectAddExpansionBlocks', 'objectRemoveExpansionBlocks', 'objectReorder',
            'objectAddAIUtilizeBlocks', 'objectRemoveAIUtilizeBlocks',
            'objectAddHardwareLiteBlocks', 'objectRemoveHardwareLiteBlocks',
            // Variable
            'variableContainerAddVariable', 'variableContainerRemoveVariable',
            'variableContainerAddList', 'variableContainerRemoveList',
            'variableContainerAddMessage', 'variableContainerRemoveMessage',
            'variableContainerSelectFilter', 'variableContainerClickVariableAddButton',
            'variableContainerClickListAddButton', 'variableContainerClickMessageAddButton',
            'variableAddSetName', 'variableAddSetScope', 'variableAddSetCloud',
            'variableSetVisibility', 'variableSetDefaultValue', 'variableSetSlidable',
            'variableSetMinValue', 'variableSetMaxValue', 'variableSetName',
            'listAddSetName', 'listAddSetScope', 'listAddSetCloud',
            'listSetVisibility', 'listChangeLength', 'listSetDefaultValue', 'listSetName',
            'messageSetName', 'setMessageEditable', 'setVariableEditable', 'setListEditable',
            // Function
            'funcEditStart', 'funcEditEnd', 'funcRemove', 'funcCreate', 'funcChangeType',
            // Comment
            'createComment', 'removeComment', 'showAllComment', 'hideAllComment',
            'moveComment', 'toggleComment', 'cloneComment', 'uncloneComment',
            'separateComment', 'connectComment', 'writeComment',
            // Misc
            'do', 'undo', 'redo', 'dismissModal',
            'toggleRun', 'toggleStop', 'containerSelectObject', 'addObjectButtonClick',
            'playgroundChangeViewMode',
            'dataTableAddSource', 'dataTableRemoveSource',
        ]);

        const safeEntryDo = (commandName: string, ...args: any[]): any => {
            if (!VALID_ENTRY_COMMANDS.has(commandName)) {
                console.error(
                    `[SafeEntryDo] ❌ Invalid Entry.do command: "${commandName}" — ` +
                    `이 이름은 COMMAND_TYPES에 없습니다. 삽입을 중단합니다.\n` +
                    `유효한 커맨드 예: addThread, variableContainerAddVariable, funcRemove 등`
                );
                throw new Error(`[SafeEntryDo] Invalid command: "${commandName}"`);
            }
            return entryObj.do(commandName, ...args);
        };

        // ── 변수 자동 생성: code_json 내 set_variable / get_variable 변수 사전 등록 ────
        if (entryObj.variableContainer) {
            const collectVariables = (block: any, varSet: Set<string>) => {
                if (!block || typeof block !== 'object') return;
                if ((block.type === 'get_variable' || block.type === 'set_variable') && Array.isArray(block.params) && block.params[0]) {
                    const varName = block.params[0];
                    if (typeof varName === 'string' && varName.trim().length > 0) {
                        varSet.add(varName);
                    }
                }
                if (Array.isArray(block.params)) {
                    block.params.forEach((p: any) => collectVariables(p, varSet));
                }
                if (Array.isArray(block.statements)) {
                    block.statements.forEach((branch: any) => {
                        if (Array.isArray(branch)) {
                            branch.forEach((b: any) => collectVariables(b, varSet));
                        }
                    });
                }
            };

            const usedVars = new Set<string>();
            threads.forEach((th: any[]) => {
                if (Array.isArray(th)) {
                    th.forEach((b: any) => collectVariables(b, usedVars));
                }
            });

            usedVars.forEach((varName: string) => {
                createEntryVariable(varName);
            });
        }


        // ── id 주입 + 좌표 설정 + Entry.js 파라미터 규격 자동 정규화(null 패딩) ────
        const generateId = entryObj.generateHash
            ? () => entryObj.generateHash()
            : () => Math.random().toString(36).slice(2, 10);

        // ── [object Object] 방어: dialog/dialog_time VALUE 슬롯에 연산 블록이 들어오면
        //    자동으로 set_variable(_tmp_calc_N, 연산블록) + dialog(get_variable(_tmp_calc_N))
        //    으로 분리해서 삽입 전에 스레드를 재구성합니다.
        const CALC_BLOCK_TYPES = new Set(['calc_plus', 'calc_minus', 'calc_times', 'calc_divide']);
        let tmpCalcCounter = 0;

        function preprocessThread(blockList: any[]): any[] {
            const result: any[] = [];
            for (const block of blockList) {
                if (!block || typeof block !== 'object') {
                    result.push(block);
                    continue;
                }
                // dialog / dialog_time VALUE 슬롯에 calc 블록이 직접 들어온 경우 분리
                if ((block.type === 'dialog' || block.type === 'dialog_time') && Array.isArray(block.params)) {
                    // VALUE 슬롯: dialog의 paramsKeyMap.VALUE=0, dialog_time의 paramsKeyMap.VALUE=0
                    const firstParam = block.params[0];
                    if (firstParam && typeof firstParam === 'object' && CALC_BLOCK_TYPES.has(firstParam.type)) {
                        const tmpVarName = `_tmp_calc_${tmpCalcCounter++}`;
                        // 임시 변수 자동 생성
                        createEntryVariable(tmpVarName);
                        // set_variable(_tmp_calc_N, 연산블록) 삽입
                        const setVarBlock = {
                            type: 'set_variable',
                            params: [tmpVarName, firstParam],
                        };
                        result.push(setVarBlock);
                        // dialog의 VALUE를 get_variable(_tmp_calc_N)으로 교체
                        const newDialogBlock = JSON.parse(JSON.stringify(block));
                        newDialogBlock.params = [{ type: 'get_variable', params: [tmpVarName] }];
                        // 나머지 params (option 등) 보존
                        for (let pi = 1; pi < block.params.length; pi++) {
                            if (block.params[pi] !== undefined) newDialogBlock.params[pi] = block.params[pi];
                        }
                        console.log(`[Phase10][CalcSplit] dialog VALUE split: "${firstParam.type}" → set_variable("${tmpVarName}") + dialog(get_variable("${tmpVarName}"))`);
                        result.push(newDialogBlock);
                        continue;
                    }
                }
                // statements가 있는 컨테이너 블록은 재귀 전처리
                if (block.statements && Array.isArray(block.statements)) {
                    const newBlock = JSON.parse(JSON.stringify(block));
                    newBlock.statements = block.statements.map((branch: any) => {
                        if (!Array.isArray(branch)) return branch;
                        return preprocessThread(branch);
                    });
                    result.push(newBlock);
                    continue;
                }
                result.push(block);
            }
            return result;
        }

        function normalizeBlock(block: any, isRoot: boolean, startX: number, startY: number): any {
            if (!block || typeof block !== 'object') return block;

            const normalized = JSON.parse(JSON.stringify(block));
            if (!normalized.id) normalized.id = generateId();

            if (isRoot) {
                normalized.x = startX;
                normalized.y = startY;
            }

            // 1. statements 하위 블록 재귀적 정규화
            if (normalized.statements && Array.isArray(normalized.statements)) {
                normalized.statements = normalized.statements.map((branch: any) => {
                    if (!Array.isArray(branch)) return branch;
                    return branch.map((child: any) => normalizeBlock(child, false, 0, 0));
                });
            }

            // 2. params 하위 블록/값 재귀적 정규화 (null/undefined 제외 실질 입력 추출)
            const realInputs: any[] = [];
            if (normalized.params && Array.isArray(normalized.params)) {
                normalized.params.forEach((p: any) => {
                    if (p !== null && p !== undefined) {
                        if (typeof p === 'object') {
                            realInputs.push(normalizeBlock(p, false, 0, 0));
                        } else {
                            realInputs.push(p);
                        }
                    }
                });
            }

            // 2-1. get_variable / set_variable 변수 ID 바인딩
            if ((normalized.type === 'get_variable' || normalized.type === 'set_variable') && realInputs.length > 0 && typeof realInputs[0] === 'string') {
                const varName = realInputs[0];
                const vc = entryObj.variableContainer;
                const varObj = vc && vc.getVariableByName
                    ? vc.getVariableByName(varName)
                    : null;
                if (varObj && varObj.id_) {
                    realInputs[0] = varObj.id_;
                    console.log(`[VariableBinding] Successfully bound variable "${varName}" to ID "${varObj.id_}"`);
                } else {
                    console.warn(`[VariableBinding] ⚠️ 변수 "${varName}"를 찾을 수 없어 이름 그대로 삽입됩니다. (getVariableByName returned null or missing id_)`);
                }
            }

            // 3. Entry.block 스펙 참조하여 인디케이터/텍스트 슬롯 null 패딩 매핑
            const entryDef = entryObj.block ? entryObj.block[normalized.type] : null;
            if (entryDef && entryDef.params && Array.isArray(entryDef.params)) {
                const expectedCount = entryDef.params.length;
                const keyMap = entryDef.paramsKeyMap || {};
                const padded = new Array(expectedCount).fill(null);

                const keys = Object.keys(keyMap);
                if (keys.length > 0) {
                    keys.forEach((k: string, idx: number) => {
                        const targetIdx = keyMap[k];
                        if (idx < realInputs.length) {
                            padded[targetIdx] = realInputs[idx];
                        }
                    });
                } else {
                    let inputIdx = 0;
                    for (let i = 0; i < expectedCount; i++) {
                        const pDef = entryDef.params[i];
                        if (pDef && (pDef.type === 'Block' || pDef.type === 'TextInput' || pDef.type === 'Dropdown' || pDef.type === 'DropdownDynamic')) {
                            if (inputIdx < realInputs.length) {
                                padded[i] = realInputs[inputIdx++];
                            }
                        }
                    }
                }

                // dialog 블록의 옵션 기본값 보정 (말하기 옵션 "speak")
                if (normalized.type === 'dialog' && expectedCount >= 2 && padded[1] === null) {
                    padded[1] = 'speak';
                }

                normalized.params = padded;
            } else {
                normalized.params = realInputs;
            }

            return normalized;
        }

        let attemptedCount = 0;
        for (const threadData of threads) {
            if (!Array.isArray(threadData) || threadData.length === 0) continue;

            // dialog VALUE에 calc 블록이 직접 있으면 변수 분리 전처리
            const preprocessedThread = preprocessThread(threadData);

            const nextY = maxY === 40 ? 50 : maxY + 120;
            const preparedThread = preprocessedThread.map((block: any, bIdx: number) => {
                return normalizeBlock(block, bIdx === 0, 50, nextY);
            });

            if (preparedThread[0]) {
                maxY = preparedThread[0].y;
            }

            safeEntryDo('addThread', preparedThread);
            attemptedCount++;
        }

        // ── 삽입 후 threadCount 비교 (실제 성공 검증) ────────────────────────
        const afterCount: number = typeof codeObj.getThreadCount === 'function'
            ? codeObj.getThreadCount()
            : (codeObj.getThreads ? codeObj.getThreads().length : 0);

        const actualInserted = afterCount - beforeCount;
        console.log(`[Phase9] threadCount: ${beforeCount} → ${afterCount} (attempted=${attemptedCount}, actual=${actualInserted})`);

        // 보드 리드로우 강제
        if (board.reDraw) board.reDraw();

        if (actualInserted <= 0) {
            return {
                success: false,
                insertedCount: 0,
                error: `삽입을 시도했지만 블록이 추가되지 않았습니다 (before=${beforeCount}, after=${afterCount}).`,
            };
        }

        return { success: true, insertedCount: actualInserted };
    } catch (err: any) {
        console.error('[Phase9] Failed to insert code_json to canvas:', err);
        return { success: false, insertedCount: 0, error: err?.message || String(err) };
    }
}

export const AIAsidePanel: React.FC = () => {
    const [input, setInput] = useState('');

    // Phase 8 — Check ANTHROPIC_API_KEY environment variable status via IPC
    useEffect(() => {
        ipcRendererHelper.getAnthropicApiKeyInfo().then((info) => {
            if (info && info.exists) {
                console.log(`[Phase8][ApiKey] ANTHROPIC_API_KEY detected successfully: ${info.maskedKey}`);
            } else {
                console.warn('[Phase8][ApiKey] ANTHROPIC_API_KEY is not defined in process.env');
            }
        }).catch((err) => {
            console.error('[Phase8][ApiKey] Failed to check ANTHROPIC_API_KEY:', err);
        });
    }, []);

    // Phase 4 — Coaching Trigger state (useRef to avoid stale closure in handleSend)
    // NOTE: keywordCountsRef and coachingShownRef are reset on component remount (session change).
    // There is no explicit reset logic; the session lifecycle relies on AIAsidePanel being
    // unmounted/remounted when a new session starts (e.g., new project loaded).
    const keywordCountsRef = useRef<Record<string, number>>({});
    const coachingShownRef = useRef<Set<string>>(new Set());
            // (Removed duplicate clarification refs)
    // Phase 5 — Reflection Trigger: independent timestamp reference.
    const lastReflectionCheckTimeRef = useRef<string | null>(null);
    const reflectionCooldownRef = useRef<number>(0); // timestamp (ms) until which reflection is on cooldown
    const REFLECTION_WINDOW_MS = 30 * 1000; // 30 seconds window after suggestion
    const REFLECTION_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes cooldown after showing
    // Phase 5 — Exploration Trigger: error counting based on message template key
    const errorMessageCountsRef = useRef<Record<string, number>>({});
    const hasErrorInCurrentRunRef = useRef<boolean>(false);
    const explorationShownRef = useRef<boolean>(false);

    // Phase 4 — Clarification Trigger: tracks the timestamp of the LATEST block_suggestion.
    // Multiple rapid suggestions will overwrite this ref, so only the last one defines
    // the window start. A run_start event checks block_change events after this timestamp.
    const lastSuggestionTimeRef = useRef<string | null>(null);
    const clarificationShownRef = useRef<boolean>(false);

    // Phase 6 — Data Collection Consent State
    const [showConsentModal, setShowConsentModal] = useState<boolean>(() => {
        return localStorage.getItem('entry_facilitator_consent') === null;
    });
    const [isConsentGranted, setIsConsentGranted] = useState<boolean>(() => {
        return eventLogger.getIsDataCollectionEnabled();
    });

    const handleConsentChoice = (granted: boolean) => {
        localStorage.setItem('entry_facilitator_consent', granted ? 'granted' : 'denied');
        eventLogger.setDataCollectionEnabled(granted);
        setIsConsentGranted(granted);
        setShowConsentModal(false);
        console.log(`[Phase6] User selected data collection consent: ${granted ? 'GRANTED' : 'DENIED'}`);
    };

    // Check if current session is a New Project session & whether first chat has been sent
    const isNewProject = eventLogger.getIsNewProjectSession();

    // Initial messages logic:
    // Restore loaded messages if available from project.json, otherwise init default.
    const [messages, setMessages] = useState<ChatMessage[]>(() => {
        const loadedMessages = (window as any).__ENTRY_LOADED_MESSAGES__;
        if (Array.isArray(loadedMessages) && loadedMessages.length > 0) {
            return loadedMessages;
        }

        const initList: ChatMessage[] = [
            {
                id: 'assistant_init',
                sender: 'code_assistant',
                title: '코드 도우미',
                text: '안녕하세요! 코드 생성을 돕는 코드 도우미입니다. 만들고 싶은 블록이나 코딩 질문을 편하게 남겨주세요!',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
        ];

        // Requirement 1: Modeling trigger (Shown ONLY before first input in a new project session)
        if (isNewProject && !eventLogger.getHasSentFirstChat()) {
            const modelingText = '어떤 기능이 필요하고 어떤 순서로 만들지 생각해봤나요?';
            initList.push({
                id: 'modeling_trigger',
                sender: 'facilitator',
                title: '🧭 AI 퍼실리테이터 - 모델링 안내',
                text: modelingText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            });
            eventLogger.logFacilitatorIntervention('modeling', modelingText);
        }

        return initList;
    });

    // Phase 6: Sync messages array to window object for project save export
    useEffect(() => {
        (window as any).__ENTRY_AI_MESSAGES__ = messages;
    }, [messages]);


    // Phase 4 — Clarification Trigger: subscribe via eventLogger (NOT Entry.addEventListener).
    // eventLogger.addRunStartListener avoids the Entry load-timing issue: if Entry is not
    // yet available when AIAsidePanel mounts, Entry.addEventListener would be silently skipped.
    // Since logRunStart() always calls our listener regardless of Entry, the timing is reliable.
    useEffect(() => {
        const unsubscribe = eventLogger.addRunStartListener(() => {
            // ---- Clarification Trigger (Phase 4) ----
            const suggestionTime = lastSuggestionTimeRef.current;
            if (suggestionTime && !clarificationShownRef.current) {
                const logs = eventLogger.getLogs();
                const hasBlockChangeAfterSuggestion = logs.some(
                    (e) => e.type === 'block_change' && e.timestamp > suggestionTime
                );
                if (!hasBlockChangeAfterSuggestion) {
                    clarificationShownRef.current = true;
                    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const clarificationText = 'AI가 제안한 블록이 뭘 하는지 스스로 설명해볼 수 있나요?';
                    const clarificationMsg: ChatMessage = {
                        id: `clarification_${Date.now()}`,
                        sender: 'facilitator',
                        title: '🧭 AI 퍼실리테이터 - 명료화 안내',
                        text: clarificationText,
                        timestamp: nowTime,
                    };
                    setMessages((prev) => [...prev, clarificationMsg]);
                    eventLogger.logFacilitatorIntervention('clarification', clarificationText);
                    console.log('[Phase4][Clarification] Clarification card triggered (no block_change after last suggestion).');
                } else {
                    console.log('[Phase4][Clarification] Block changes detected after suggestion — clarification skipped.');
                }
            }
            // Reset suggestion timestamp after handling
            lastSuggestionTimeRef.current = null;
            clarificationShownRef.current = false;

            // ---- Exploration Reset Logic (Phase 5) ----
            if (!hasErrorInCurrentRunRef.current) {
                // No errors logged in the interval before this run_start → reset counts
                errorMessageCountsRef.current = {};
                explorationShownRef.current = false;
                console.log('[Phase5][Exploration] No errors in previous run interval; error counters reset.');
            }
            // Prepare for next interval
            hasErrorInCurrentRunRef.current = false;
        });

        // Cleanup: unsubscribe when component unmounts
        return unsubscribe;
    }, []);


    const handleSend = () => {
        const trimmed = input.trim();
        if (!trimmed) {
            return;
        }

        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // 1. Log event via eventLogger (type: "ai_chat_input")
        eventLogger.logAIChatInput(trimmed);

        // Phase 4 — Coaching Trigger:
        // Splits the learner's message into tokens and counts per-keyword occurrences
        // using simple substring matching (includes). This is intentionally checking
        // the LEARNER's input only (ai_chat_input), NOT the code assistant's replies.
        // Morphological analysis is deferred; plain string matching is sufficient for MVP.
        // keywordCountsRef/coachingShownRef are reset only on component remount (session change) —
        // useRef (not useState) is used here to avoid stale closure bugs in handleSend.
        const tokens = trimmed.split(/\s+/);
        const coachingCards: ChatMessage[] = [];

        for (const token of tokens) {
            const pastCount = keywordCountsRef.current[token] || 0;
            keywordCountsRef.current[token] = pastCount + 1;

            // Trigger on reaching exactly 3 (≥3) for the first time per keyword
            if (keywordCountsRef.current[token] >= 3 && !coachingShownRef.current.has(token)) {
                coachingShownRef.current.add(token);
                const coachingText = 'AI의 답변 중 어떤 부분이 이해하기 어려운가요?';
                coachingCards.push({
                    id: `coaching_${token}_${Date.now()}`,
                    sender: 'facilitator',
                    title: '🧭 AI 퍼실리테이터 - 코칭 안내',
                    text: coachingText,
                    timestamp: nowTime,
                });
                eventLogger.logFacilitatorIntervention('coaching', coachingText, { keyword: token, count: keywordCountsRef.current[token] });
                console.log(`[Phase4][Coaching] Keyword "${token}" appeared ${keywordCountsRef.current[token]}x — coaching card triggered.`);
            }
        }
        // Phase 5 — Reflection Trigger: check if a recent suggestion exists within window and cooldown passed
        let reflectionMsg: ChatMessage | null = null;
        if (lastReflectionCheckTimeRef.current) {
            const prevSuggestion = new Date(lastReflectionCheckTimeRef.current);
            const now = new Date();
            if (now.getTime() - prevSuggestion.getTime() <= REFLECTION_WINDOW_MS && now.getTime() >= reflectionCooldownRef.current) {
                const reflectionText = 'AI의 접근 방식이 당신과 어떻게 다르고, 왜 다른가요?';
                reflectionMsg = {
                    id: `reflection_${Date.now()}`,
                    sender: 'facilitator',
                    title: '🧭 AI 퍼실리테이터 - 성찰 안내',
                    text: reflectionText,
                    timestamp: nowTime,
                };
                reflectionCooldownRef.current = now.getTime() + REFLECTION_COOLDOWN_MS;
                eventLogger.logFacilitatorIntervention('reflection', reflectionText);
                console.log('[Phase5][Reflection] Reflection card triggered.');
            }
        }
        const isFirstInput = !eventLogger.getHasSentFirstChat();

        // 2. Append User Message
        const userMsg: ChatMessage = {
            id: `user_${Date.now()}`,
            sender: 'user',
            text: trimmed,
            timestamp: nowTime,
        };

        // Collect facilitator cards triggered during this chat input turn to be shown AFTER Code Assistant's reply
        const pendingFacilitatorCards: ChatMessage[] = [];

        // Append reflection card if triggered
        if (reflectionMsg) {
            pendingFacilitatorCards.push(reflectionMsg);
        }

        // Append coaching cards if any
        if (coachingCards.length > 0) {
            pendingFacilitatorCards.push(...coachingCards);
        }

        // 3. Requirement 2: Scaffolding trigger (Shown ONLY upon first input in session)
        if (isFirstInput) {
            eventLogger.markFirstChatSent();
            const scaffoldingText = '어떤 부분을 스스로 해결할 수 있고, 어떤 부분에 AI 도움이 필요한가요?';
            const scaffoldingMsg: ChatMessage = {
                id: `scaffolding_${Date.now()}`,
                sender: 'facilitator',
                title: '🧭 AI 퍼실리테이터 - 스캐폴딩 안내',
                text: scaffoldingText,
                timestamp: nowTime,
            };
            pendingFacilitatorCards.push(scaffoldingMsg);
            eventLogger.logFacilitatorIntervention('scaffolding', scaffoldingText);
        }

        // 4. Code Assistant Response (Real Claude Haiku 4.5 API Call with Loading Card)
        const loadingId = `assistant_loading_${Date.now()}`;
        const loadingReply: ChatMessage = {
            id: loadingId,
            sender: 'code_assistant',
            title: '코드 도우미',
            text: '🤖 코드 도우미가 답변을 생각하고 있어요...',
            timestamp: nowTime,
        };

        const updatedList: ChatMessage[] = [...messages, userMsg, loadingReply];

        setMessages(updatedList);
        setInput('');

        // Extract conversation history between user and code_assistant only (excluding facilitator cards)
        // Keep up to 10 recent turns (20 messages max) to manage token cost
        const historyForAssistant: Array<{ role: 'user' | 'assistant'; content: string }> = messages
            .filter((m) => (m.sender === 'user' || m.sender === 'code_assistant') && !m.id.includes('loading') && m.text.trim().length > 0)
            .map((m) => ({
                role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                content: m.text,
            }))
            .slice(-20);

        console.log(`[Phase8][History] Sending ${historyForAssistant.length} history message(s) to Claude API.`);

        // Call Anthropic Claude API via IPC with history
        ipcRendererHelper.callCodeAssistantApi(trimmed, historyForAssistant).then((res) => {
            const apiNowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            let responseText = res.text || '답변을 불러오지 못했습니다.';

            // Phase 9: Real canvas block insertion
            const extraCards: ChatMessage[] = [];
            if (res.code_json && Array.isArray(res.code_json) && res.code_json.length > 0) {
                console.log('[Phase9] Inserting code_json to canvas:', res.code_json);
                const insertRes = insertCodeJsonToCanvas(res.code_json);
                if (insertRes.success) {
                    extraCards.push({
                        id: `insert_success_${Date.now()}`,
                        sender: 'code_assistant',
                        title: '코드 도우미',
                        text: '✅ 캔버스에 추가 완료!',
                        timestamp: apiNowTime,
                    });
                } else {
                    const fallbackText = insertRes.isConditionFallback
                        ? (insertRes.error || '')
                        : `코드를 캔버스에 자동으로 추가하는 중에 문제가 생겼어요 (${insertRes.error || ''}). 필요 시 오른쪽 블록 메뉴에서 직접 만들어볼까요?`;
                    extraCards.push({
                        id: `insert_failed_${Date.now()}`,
                        sender: 'facilitator',
                        title: '🧭 AI 퍼실리테이터 - 안내',
                        text: fallbackText,
                        timestamp: apiNowTime,
                    });
                }
            }

            const realAssistantReply: ChatMessage = {
                id: `assistant_${Date.now()}`,
                sender: 'code_assistant',
                title: '코드 도우미',
                text: responseText,
                timestamp: apiNowTime,
            };

            setMessages((prev) => {
                const newArr: ChatMessage[] = [];
                for (const msg of prev) {
                    if (msg.id === loadingId) {
                        newArr.push(realAssistantReply);
                        if (extraCards.length > 0) {
                            newArr.push(...extraCards);
                        }
                        if (pendingFacilitatorCards.length > 0) {
                            newArr.push(...pendingFacilitatorCards);
                        }
                    } else {
                        newArr.push(msg);
                    }
                }
                return newArr;
            });

            // Phase 4 — Clarification & Reflection Trigger timestamp update
            const suggestionEvent = eventLogger.logBlockSuggestion({ query: trimmed, responseText, code_json: res.code_json });
            lastSuggestionTimeRef.current = suggestionEvent.timestamp;
            lastReflectionCheckTimeRef.current = suggestionEvent.timestamp;
            console.log(`[Phase8][Claude] Real AI response received and swapped into chat.`);
        }).catch((err) => {
            const errorReply: ChatMessage = {
                id: `assistant_err_${Date.now()}`,
                sender: 'code_assistant',
                title: '코드 도우미',
                text: `오류가 발생했습니다: ${err.message}`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
            setMessages((prev) => {
                const newArr: ChatMessage[] = [];
                for (const msg of prev) {
                    if (msg.id === loadingId) {
                        newArr.push(errorReply);
                        if (pendingFacilitatorCards.length > 0) {
                            newArr.push(...pendingFacilitatorCards);
                        }
                    } else {
                        newArr.push(msg);
                    }
                }
                return newArr;
            });
        });
    };


    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    };

    // ---- Error Hook for Exploration Trigger (Phase 5) ----
    // Monkey‑patch eventLogger.logError to count error messages by their template key.
    // This runs once when the component mounts.
    useEffect(() => {
        const originalLogError = eventLogger.logError.bind(eventLogger);
        eventLogger.logError = (title: string, message: string, payload?: Record<string, any>) => {
            const log = originalLogError(title, message, payload);
            if (log) {
                const key = log.payload?.message || '';
                if (key) {
                    // Mark that an error occurred in the current run interval
                    hasErrorInCurrentRunRef.current = true;
                    const count = (errorMessageCountsRef.current[key] || 0) + 1;
                    errorMessageCountsRef.current[key] = count;
                    console.log(`[Phase5][Exploration] Error key "${key}" count = ${count}`);
                    if (count >= 2 && !explorationShownRef.current) {
                        // Show exploration card immediately
                        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const explorationText = 'AI에게 확인하기 전에, 코드를 고칠 다른 방법을 생각해보세요.';
                        const explorationMsg: ChatMessage = {
                            id: `exploration_${Date.now()}`,
                            sender: 'facilitator',
                            title: '🧭 AI 퍼실리테이터 - 탐색 안내',
                            text: explorationText,
                            timestamp: nowTime,
                        };
                        setMessages((prev) => [...prev, explorationMsg]);
                        explorationShownRef.current = true;
                        eventLogger.logFacilitatorIntervention('exploration', explorationText, { errorKey: key, errorCount: count });
                        console.log('[Phase5][Exploration] Exploration card triggered.');
                    }
                }
            }
            return log;
        };
        // Cleanup: restore original method on unmount
        return () => {
            eventLogger.logError = originalLogError;
        };
    }, []);


    return (
        <aside
            style={{
                width: '320px',
                minWidth: '320px',
                height: 'calc(100vh - 43px)',
                backgroundColor: '#ffffff',
                borderLeft: '1px solid #e1e4e8',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                fontFamily: 'NanumGothic, sans-serif',
                zIndex: 10,
            }}
        >
            {/* Main Header */}
            <div
                style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid #e1e4e8',
                    backgroundColor: '#f8f9fa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                        style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            backgroundColor: isConsentGranted ? '#28a745' : '#ffc107',
                            display: 'inline-block',
                        }}
                    />
                    <strong style={{ fontSize: '13px', color: '#212529' }}>
                        AI 협력 공간
                    </strong>
                    {(() => {
                        const nickname = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('nickname') : null;
                        if (!nickname) return null;
                        return (
                            <span style={{
                                fontSize: '11px',
                                color: '#0056b3',
                                backgroundColor: '#cce5ff',
                                padding: '2px 7px',
                                borderRadius: '10px',
                                fontWeight: 'bold',
                                marginLeft: '4px',
                            }}>
                                {nickname}님 👋
                            </span>
                        );
                    })()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                        onClick={() => setShowConsentModal(!showConsentModal)}
                        style={{
                            fontSize: '10px',
                            color: isConsentGranted ? '#155724' : '#721c24',
                            backgroundColor: isConsentGranted ? '#d4edda' : '#f8d7da',
                            border: '1px solid ' + (isConsentGranted ? '#c3e6cb' : '#f5c6cb'),
                            padding: '2px 6px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                        }}
                    >
                        수집: {isConsentGranted ? '동의함' : '미동의'}
                    </button>
                    <span
                        style={{
                            fontSize: '11px',
                            color: '#495057',
                            backgroundColor: '#e9ecef',
                            padding: '2px 6px',
                            borderRadius: '4px',
                        }}
                    >
                        Phase 9
                    </span>
                </div>
            </div>

            {/* Consent Modal / Banner */}
            {showConsentModal && (
                <div
                    style={{
                        padding: '12px 14px',
                        backgroundColor: '#e7f5ff',
                        borderBottom: '1px solid #a5d8ff',
                        fontSize: '12px',
                        color: '#1864ab',
                        lineHeight: '1.4',
                    }}
                >
                    <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>🔒 학습 데이터 수집 동의 안내</div>
                    <div>학습 데이터가 연구 목적으로 수집될 수 있습니다. 동의하시겠습니까?</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => handleConsentChoice(false)}
                            style={{
                                padding: '4px 10px',
                                backgroundColor: '#ffffff',
                                color: '#495057',
                                border: '1px solid #ced4da',
                                borderRadius: '4px',
                                fontSize: '11px',
                                cursor: 'pointer',
                            }}
                        >
                            거부 (로깅 꺼짐)
                        </button>
                        <button
                            onClick={() => handleConsentChoice(true)}
                            style={{
                                padding: '4px 10px',
                                backgroundColor: '#228be6',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                            }}
                        >
                            동의 (로깅 켜짐)
                        </button>
                    </div>
                </div>
            )}

            {/* Persona Legend Banner */}
            <div
                style={{
                    padding: '8px 12px',
                    backgroundColor: '#f1f3f5',
                    borderBottom: '1px solid #e9ecef',
                    fontSize: '11px',
                    color: '#495057',
                    display: 'flex',
                    gap: '12px',
                    justifyContent: 'center',
                }}
            >
                <span>🤖 <strong>코드 도우미</strong> (질문/코드)</span>
                <span>|</span>
                <span>🧭 <strong>AI 퍼실리테이터</strong> (안내/조력)</span>
            </div>

            {/* Messages Area */}
            <div
                style={{
                    flex: 1,
                    padding: '12px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    backgroundColor: '#fafafa',
                }}
            >
                {messages.map((msg) => {
                    if (msg.sender === 'user') {
                        // User message (Right aligned, Blue)
                        return (
                            <div
                                key={msg.id}
                                style={{
                                    alignSelf: 'flex-end',
                                    maxWidth: '85%',
                                    padding: '8px 12px',
                                    borderRadius: '12px 12px 2px 12px',
                                    backgroundColor: '#007bff',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                                }}
                            >
                                <div style={{ wordBreak: 'break-word', lineHeight: '1.4' }}>{msg.text}</div>
                                <div
                                    style={{
                                        fontSize: '10px',
                                        marginTop: '4px',
                                        textAlign: 'right',
                                        opacity: 0.8,
                                    }}
                                >
                                    {msg.timestamp}
                                </div>
                            </div>
                        );
                    } else if (msg.sender === 'code_assistant') {
                        // Code Assistant message (Left aligned, Light Blue/Slate)
                        return (
                            <div
                                key={msg.id}
                                style={{
                                    alignSelf: 'flex-start',
                                    maxWidth: '90%',
                                    padding: '10px 12px',
                                    borderRadius: '12px 12px 12px 2px',
                                    backgroundColor: '#ffffff',
                                    border: '1px solid #c5d9ed',
                                    fontSize: '13px',
                                    boxShadow: '0 1px 3px rgba(0,123,255,0.05)',
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        color: '#0056b3',
                                        marginBottom: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                    }}
                                >
                                    🤖 {msg.title || '코드 도우미'}
                                </div>
                                <div style={{ color: '#212529', wordBreak: 'break-word', lineHeight: '1.4' }}>
                                    {renderMarkdown(msg.text)}
                                </div>
                                <div
                                    style={{
                                        fontSize: '10px',
                                        marginTop: '6px',
                                        textAlign: 'right',
                                        color: '#868e96',
                                    }}
                                >
                                    {msg.timestamp}
                                </div>
                            </div>
                        );
                    } else {
                        // AI Facilitator Proactive Intervention Card (Yellow/Amber Card)
                        return (
                            <div
                                key={msg.id}
                                style={{
                                    alignSelf: 'stretch',
                                    padding: '12px 14px',
                                    borderRadius: '8px',
                                    backgroundColor: '#fff9db',
                                    border: '1px solid #ffe066',
                                    boxShadow: '0 2px 4px rgba(252,196,25,0.15)',
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                        color: '#d9480f',
                                        marginBottom: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <span>{msg.title || '🧭 AI 퍼실리테이터'}</span>
                                    <span
                                        style={{
                                            fontSize: '10px',
                                            backgroundColor: '#ffe8cc',
                                            color: '#d9480f',
                                            padding: '1px 5px',
                                            borderRadius: '3px',
                                        }}
                                    >
                                        개입 안내
                                    </span>
                                </div>
                                <div
                                    style={{
                                        color: '#343a40',
                                        fontSize: '12px',
                                        wordBreak: 'break-word',
                                        lineHeight: '1.5',
                                    }}
                                >
                                    {renderMarkdown(msg.text)}
                                </div>
                                <div
                                    style={{
                                        fontSize: '10px',
                                        marginTop: '6px',
                                        textAlign: 'right',
                                        color: '#868e96',
                                    }}
                                >
                                    {msg.timestamp}
                                </div>
                            </div>
                        );
                    }
                })}
            </div>

            {/* Input Form (Unified Input to Code Assistant) */}
            <div
                style={{
                    padding: '10px 12px',
                    borderTop: '1px solid #e1e4e8',
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    gap: '8px',
                }}
            >
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="코드 도우미에게 질문하기..."
                    style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #ced4da',
                        fontSize: '13px',
                        outline: 'none',
                    }}
                />
                <button
                    onClick={handleSend}
                    style={{
                        padding: '8px 14px',
                        backgroundColor: '#007bff',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    전송
                </button>
            </div>
        </aside>
    );
};

export default AIAsidePanel;
