import { app, ipcMain, IpcMainInvokeEvent, shell, systemPreferences } from 'electron';
import path from 'path';
import MainUtils from './mainUtils';
import DataTableManager from './dataTable/dataTableManager';
import Constants from './constants';
import CommonUtils from './commonUtils';
import checkUpdateRequest from './utils/network/checkUpdate';
import createLogger from './utils/functions/createLogger';
import isValidAsarFile, { getPapagoHeaderInfoByValidator } from './utils/functions/isValidAsarFile';
import fileUtils from './fileUtils';
require('@electron/remote/main').initialize();

const logger = createLogger('main/ipcMainHelper.ts');
/**
 * ipc process 의 이벤트를 등록한다.
 * 실제 로직은 mainUtils 에서 동작한다.
 * MVC 의 Controller 와 비슷한 역할을 한다.
 * 추가하는 로직은 일반적으로 다음 프로세스에 들어갈 인자의 가공이다.
 *
 * main.js 에서 선언되어있다.
 * 이 클래스의 ipc event 들은 mainWindow, workspace 와 관련이 있다.
 */
new (class {
    constructor() {
        ipcMain.handle('saveProject', this.saveProject.bind(this));
        ipcMain.handle('loadProject', this.loadProject.bind(this));
        ipcMain.handle('resetDirectory', this.resetSaveDirectory.bind(this));
        ipcMain.handle('exportObject', this.exportObject.bind(this));
        ipcMain.handle('importObjects', this.importObjects.bind(this));
        ipcMain.handle('importObjectsFromResource', this.importObjectsFromResource.bind(this));
        ipcMain.handle('importPictures', this.importPictures.bind(this));
        ipcMain.handle('importPicturesFromResource', this.importPicturesFromResource.bind(this));
        ipcMain.handle('importPictureFromCanvas', this.importPictureFromCanvas.bind(this));
        ipcMain.handle('captureBlockImage', this.captureBlockImage.bind(this));
        ipcMain.handle('importSounds', this.importSounds.bind(this));
        ipcMain.handle('importSoundsFromResource', this.importSoundsFromResource.bind(this));
        ipcMain.handle('createTableInfo', this.createTables.bind(this));
        ipcMain.handle('getTable', this.getTable.bind(this));
        ipcMain.handle('staticDownload', this.staticDownload.bind(this));
        ipcMain.handle('tempResourceDownload', this.tempResourceDownload.bind(this));
        ipcMain.handle('saveExcel', this.saveExcel.bind(this));
        ipcMain.handle('writeFile', this.writeFile.bind(this));
        ipcMain.handle('openUrl', this.openUrl.bind(this));
        ipcMain.handle('checkUpdate', this.checkUpdate.bind(this));
        ipcMain.handle('quit', this.quitApplication.bind(this));
        ipcMain.handle('checkPermission', this.checkPermission.bind(this));
        ipcMain.handle('getOpenSourceText', () => ''); // 별다른 표기 필요없음
        ipcMain.handle('isValidAsarFile', this.checkIsValidAsarFile.bind(this));
        ipcMain.handle('saveSoundBuffer', this.saveSoundBuffer.bind(this));
        ipcMain.handle('getExistSoundFilePath', this.getExistSoundFilePath.bind(this));
        ipcMain.handle('getPapagoHeaderInfo', this.getPapagoHeaderInfo.bind(this));
        ipcMain.handle('getAnthropicApiKeyInfo', () => {
            const key = process.env.ANTHROPIC_API_KEY || '';
            if (!key) {
                logger.warn('[IPC] ANTHROPIC_API_KEY is not defined in process.env');
                return { exists: false, maskedKey: '' };
            }
            const masked = key.substring(0, 7) + '...' + key.substring(key.length - 4);
            logger.info(`[IPC] ANTHROPIC_API_KEY detected: ${masked}`);
            return { exists: true, maskedKey: masked };
        });

        ipcMain.handle('callCodeAssistantApi', async (
            event: IpcMainInvokeEvent,
            prompt: string,
            history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
            variableNames: string[] = []
        ) => {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
                return {
                    text: '오류: ANTHROPIC_API_KEY가 시스템 환경변수에 설정되어 있지 않습니다.',
                    code_json: null,
                };
            }

            interface BlockSpec {
                paramCount: number;
                allowedParamTypes?: string[][];
                hasStatements?: boolean;
                expectedBranches?: number;
            }

            const BLOCK_SPECS: Record<string, BlockSpec> = {
                when_run_button_click: { paramCount: 0 },
                move_direction: {
                    paramCount: 1,
                    allowedParamTypes: [['number', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value', 'value_of_index_from_list']],
                },
                rotate_by_angle: {
                    paramCount: 1,
                    allowedParamTypes: [['number', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value']],
                },
                dialog_time: {
                    paramCount: 2,
                    allowedParamTypes: [
                        ['text', 'number', 'get_variable', 'get_canvas_input_value', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide'],
                        ['number', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value'],
                    ],
                },
                dialog: {
                    paramCount: 1,
                    allowedParamTypes: [['text', 'number', 'get_variable', 'get_canvas_input_value', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide']],
                },
                repeat_basic: {
                    paramCount: 1,
                    allowedParamTypes: [['number', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value']],
                    hasStatements: true,
                    expectedBranches: 1,
                },
                _if: {
                    paramCount: 1,
                    allowedParamTypes: [['boolean_equal', 'boolean_bigger', 'boolean_smaller', 'boolean_and', 'boolean_or', 'boolean_not', 'True', 'False']],
                    hasStatements: true,
                    expectedBranches: 1,
                },
                if_else: {
                    paramCount: 1,
                    allowedParamTypes: [['boolean_equal', 'boolean_bigger', 'boolean_smaller', 'boolean_and', 'boolean_or', 'boolean_not', 'True', 'False']],
                    hasStatements: true,
                    expectedBranches: 2,
                },
                boolean_equal: {
                    paramCount: 2,
                    allowedParamTypes: [
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value', 'value_of_index_from_list'],
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value', 'value_of_index_from_list'],
                    ],
                },
                boolean_bigger: {
                    paramCount: 2,
                    allowedParamTypes: [
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value', 'value_of_index_from_list'],
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value', 'value_of_index_from_list'],
                    ],
                },
                boolean_smaller: {
                    paramCount: 2,
                    allowedParamTypes: [
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value', 'value_of_index_from_list'],
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value', 'value_of_index_from_list'],
                    ],
                },
                boolean_and: {
                    paramCount: 2,
                    allowedParamTypes: [
                        ['boolean_equal', 'boolean_bigger', 'boolean_smaller', 'boolean_and', 'boolean_or', 'boolean_not', 'True', 'False'],
                        ['boolean_equal', 'boolean_bigger', 'boolean_smaller', 'boolean_and', 'boolean_or', 'boolean_not', 'True', 'False'],
                    ],
                },
                boolean_or: {
                    paramCount: 2,
                    allowedParamTypes: [
                        ['boolean_equal', 'boolean_bigger', 'boolean_smaller', 'boolean_and', 'boolean_or', 'boolean_not', 'True', 'False'],
                        ['boolean_equal', 'boolean_bigger', 'boolean_smaller', 'boolean_and', 'boolean_or', 'boolean_not', 'True', 'False'],
                    ],
                },
                boolean_not: {
                    paramCount: 1,
                    allowedParamTypes: [
                        ['boolean_equal', 'boolean_bigger', 'boolean_smaller', 'boolean_and', 'boolean_or', 'boolean_not', 'True', 'False'],
                    ],
                },
                True: { paramCount: 0 },
                False: { paramCount: 0 },
                ask_and_wait: {
                    paramCount: 1,
                    allowedParamTypes: [['text', 'number', 'get_variable', 'string', 'value_of_index_from_list']],
                },
                get_canvas_input_value: {
                    paramCount: 0,
                },
                get_variable: {
                    paramCount: 1,
                    allowedParamTypes: [['text', 'string']],
                },
                set_variable: {
                    paramCount: 2,
                    allowedParamTypes: [
                        ['text', 'string'],
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value'],
                    ],
                },
                value_of_index_from_list: {
                    paramCount: 2,
                    allowedParamTypes: [
                        ['text', 'string'],
                        ['number', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value'],
                    ],
                },
                calc_plus: {
                    paramCount: 2,
                    allowedParamTypes: [
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value'],
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value'],
                    ],
                },
                calc_minus: {
                    paramCount: 2,
                    allowedParamTypes: [
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value'],
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value'],
                    ],
                },
                calc_times: {
                    paramCount: 2,
                    allowedParamTypes: [
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value'],
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value'],
                    ],
                },
                calc_divide: {
                    paramCount: 2,
                    allowedParamTypes: [
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value'],
                        ['number', 'text', 'calc_plus', 'calc_minus', 'calc_times', 'calc_divide', 'get_variable', 'get_canvas_input_value'],
                    ],
                },
                number: { paramCount: 1 },
                text: { paramCount: 1 },
            };

            const START_EVENT_BLOCK_TYPES = ['when_run_button_click'];

            function validateBlockJsonTypes(codeJson: any): boolean {
                if (!codeJson) return true;
                if (!Array.isArray(codeJson)) return false;
                if (codeJson.length === 0) return true;

                // 1. Thread level validation: check if every thread starts with a Start Event Block
                const threads = (Array.isArray(codeJson[0]) && typeof codeJson[0][0] === 'object')
                    ? codeJson
                    : [codeJson];

                for (let t = 0; t < threads.length; t++) {
                    const thread = threads[t];
                    if (!Array.isArray(thread) || thread.length === 0) {
                        logger.warn(`[BlockValidator] Thread #${t} is empty or not an array`);
                        return false;
                    }

                    const firstBlock = thread[0];
                    if (!firstBlock || typeof firstBlock !== 'object' || !firstBlock.type) {
                        logger.warn(`[BlockValidator] Thread #${t} first block is missing or invalid`);
                        return false;
                    }

                    if (!START_EVENT_BLOCK_TYPES.includes(firstBlock.type)) {
                        logger.warn(`[BlockValidator] Thread #${t} must start with a start event block, but got "${firstBlock.type}"`);
                        return false;
                    }
                }

                // 2. Individual block recursive spec validation
                function checkBlock(node: any): boolean {
                    if (!node) return true;
                    if (Array.isArray(node)) {
                        return node.every(checkBlock);
                    }
                    if (typeof node === 'object') {
                        if (!node.type || typeof node.type !== 'string') {
                            logger.warn('[BlockValidator] Missing or non-string block type');
                            return false;
                        }

                        const spec = BLOCK_SPECS[node.type];
                        if (!spec) {
                            logger.warn(`[BlockValidator] Unauthorized block type: "${node.type}"`);
                            return false;
                        }

                        const params = node.params;
                        if (!Array.isArray(params)) {
                            logger.warn(`[BlockValidator] Block "${node.type}" must have a params array (even if empty [])`);
                            return false;
                        }

                        if (params.length !== spec.paramCount) {
                            logger.warn(`[BlockValidator] Block "${node.type}" expected exactly ${spec.paramCount} params, but got ${params.length}`);
                            return false;
                        }

                        for (let i = 0; i < params.length; i++) {
                            const param = params[i];
                            if (typeof param === 'object' && param !== null) {
                                if (spec.allowedParamTypes && spec.allowedParamTypes[i]) {
                                    const paramType = param.type;
                                    if (!paramType || !spec.allowedParamTypes[i].includes(paramType)) {
                                        logger.warn(`[BlockValidator] Block "${node.type}" param #${i} has disallowed type "${paramType}"`);
                                        return false;
                                    }
                                }
                                if (!checkBlock(param)) return false;
                            } else if (typeof param !== 'string' && typeof param !== 'number' && typeof param !== 'boolean') {
                                logger.warn(`[BlockValidator] Block "${node.type}" param #${i} has invalid primitive type: ${typeof param}`);
                                return false;
                            }
                        }

                        if (spec.hasStatements) {
                            const requiredBranches = spec.expectedBranches || 1;
                            if (!node.statements || !Array.isArray(node.statements) || node.statements.length !== requiredBranches) {
                                logger.warn(`[BlockValidator] Container block "${node.type}" expected exactly ${requiredBranches} statements branch(es), but got ${node.statements ? node.statements.length : 0}`);
                                return false;
                            }

                            for (let b = 0; b < requiredBranches; b++) {
                                const branch = node.statements[b];
                                if (!Array.isArray(branch) || branch.length === 0) {
                                    logger.warn(`[BlockValidator] Container block "${node.type}" branch #${b} is empty or missing! Invalidation triggered.`);
                                    return false;
                                }
                            }
                        }

                        if (node.statements && Array.isArray(node.statements)) {
                            if (!node.statements.every(checkBlock)) return false;
                        }
                    }
                    return true;
                }

                return checkBlock(codeJson);
            }

            const https = require('https');
            const systemPrompt = `당신은 초등 바이브 코딩 교육용 '코드 도우미' AI입니다.
학생이 질문하면 상냥하고 격려하는 어조로 설명하고, 도구 'emit_code_assistant_response'를 호출하세요.

[엔트리 화면의 정확한 블록 명칭 및 카테고리 사전]
다음은 실제 엔트리 화면에 표시되는 정확한 카테고리 명칭과 블록 표시 문구입니다. 반드시 이 표현만 사용하고, 지어낸 다른 표현(예: '실행 버튼', '이동 블록' 등)을 절대로 쓰지 마세요:
1. [시작] 카테고리:
   - "when_run_button_click": '시작하기 버튼을 클릭했을 때'
2. [움직임] 카테고리:
   - "move_direction": '이동 방향으로 _ 만큼 움직이기' (예: '이동 방향으로 10 만큼 움직이기')
   - "rotate_by_angle": '오브젝트를 _ 만큼 회전하기' (예: '오브젝트를 90 만큼 회전하기')
3. [생김새] 카테고리:
   - "dialog": '_ 말하기' (예: '안녕 말하기')
   - "dialog_time": '_ 을(를) _ 초 동안 말하기' (예: '안녕 을(를) 4 초 동안 말하기')
4. [흐름] 카테고리:
   - "repeat_basic": '_ 번 반복하기' (예: '10 번 반복하기')
   - "_if": '만약 _ 이(가) 참이라면' (예: '만약 (money > 1000) 이(가) 참이라면')
   - "if_else": '만약 _ 이(가) 참이라면 ~ 아니면'
5. [자료] 카테고리 (변수/리스트/입력/대답):
   - "ask_and_wait": '_ 을(를) 묻고 대답 기다리기' (예: '얼마를 저금할까요? 을(를) 묻고 대답 기다리기')
   - "get_canvas_input_value": '대답' (값 파라미터 블록, params: [])
   - "get_variable": [변수 이름]
   - "set_variable": '[변수 이름] 를 _ (으)로 정하기'
   - "value_of_index_from_list": '[리스트 이름] 의 _ 번째 항목'
6. [계산] 카테고리:
   - "calc_plus": '_ + _', "calc_minus": '_ - _', "calc_times": '_ * _', "calc_divide": '_ / _'
7. [판단] 카테고리 (조건/비교 연산):
   - "boolean_equal": '_ = _'
   - "boolean_bigger": '_ > _'
   - "boolean_smaller": '_ < _'
   - "boolean_and": '_ 그리고 _'
   - "boolean_or": '_ 또는 _'
   - "boolean_not": '_ 이(가) 아니다'

[가독성 향상 지침]
- 설명 텍스트 작성 시 중요한 블록 이름이나 카테고리 이름은 **굵은 글씨** (예: **[흐름]** 카테고리의 **'만약 money > 1000 이(가) 참이라면 ~ 아니면'** 블록)로 강조하세요.
- 각 설명 항목은 불릿 리스트('- ')와 줄바꿈(\\n)을 활용하여 깔끔하고 보기 쉽게 작성하세요.

[감싸는 구조(컨테이너) 및 조건 분기 블록 작성 필수 지침]
1. "repeat_basic", "_if", "if_else" 처럼 내부에 다른 블록을 담는 감싸는 구조(container) 블록은 반드시 \`statements\` 필드를 가져야 합니다.
2. "_if" 및 "repeat_basic"은 1개의 branch를 가지므로 \`statements\`는 1개의 2차원 배열을 갖습니다: \`statements: [ [ childBlock1, childBlock2 ] ]\`
3. "if_else"는 참일 때 실행할 블록(0번째 분기)과 거짓(아니면)일 때 실행할 블록(1번째 분기) 2개의 branch가 필수입니다: \`statements: [ [ if_child_blocks... ], [ else_child_blocks... ] ]\`
   - 두 branch 중 하나라도 비어있거나 누락되면 블록 삽입이 실패합니다! 참일 때와 거짓일 때 각각 실행할 자식 블록들을 2개의 배열로 나누어 넣으세요.
4. 음료수나 메뉴 선택지가 여러 개(2~3개 이상)인 다중 조건 분기 요청 시, 첫 번째 "if_else"의 거짓(1번째 분기) 내부에 두 번째 "if_else"를 중첩(nested if_else)하여 모든 선택지 경우의 수를 처리하세요.
5. 절대로 도중에 코드를 생략하거나 빈 배열 []로 전달하지 마세요! 요청된 모든 조건과 동작을 완벽한 code_json 블록 배열로 작성해야 합니다.

[엄격한 블록 스펙 및 스레드 시작 규칙]
1. 모든 블록 스레드 배열의 첫 번째 블록은 반드시 시작 이벤트 블록인 "when_run_button_click" 이어야 합니다!
2. "when_run_button_click": params는 반드시 빈 배열 [] 이어야 함 (params: []).
3. "ask_and_wait": params는 정확히 1개 (질문 텍스트). (예: { "type": "ask_and_wait", "params": [{ "type": "text", "params": ["입금할 금액을 입력하세요:"] }] })
4. "get_canvas_input_value": params는 빈 배열 [] 이어야 함 (params: []). 계산이나 비교 연산 인자로 사용함.
5. "move_direction": params는 정확히 1개(이동 거리 숫자).
6. "rotate_by_angle": params는 정확히 1개.
7. "dialog_time": params는 정확히 2개 (말할 내용, 시간 숫자).
8. "dialog": params는 정확히 1개 (말할 내용). 반드시 { "type": "text", "params": ["문자열"] } 또는 { "type": "get_variable", "params": ["변수이름"] } 중 하나만 허용. 절대로 calc_plus, calc_minus 같은 연산 블록 객체를 dialog의 params[0]에 직접 넣지 마세요!
9. "repeat_basic": params는 정확히 1개 (반복 횟수 숫자). 반드시 statements 내부에 1개 분기 자식 블록들을 포함해야 합니다.
10. "_if": params는 정확히 1개 (조건 판단 블록, 예: boolean_bigger). 반드시 statements 내부에 1개 분기 자식 블록들을 포함해야 합니다.
11. "if_else": params는 정확히 1개 (조건 판단 블록, 예: boolean_bigger/boolean_equal). 반드시 statements 내부에 2개 분기 자식 블록 배열 [[참일때블록들], [거짓일때블록들]]을 포함해야 합니다.
12. "boolean_bigger", "boolean_smaller", "boolean_equal": params는 정확히 2개 (비교 대상 2개, 예: get_variable과 number/text/get_canvas_input_value).
13. 모든 파라미터는 중첩 객체 형태로 작성해야 합니다 (예: { "type": "number", "params": [10] }).
14. [절대 규칙] "dialog" 또는 "dialog_time"의 말할 내용 자리(params[0])에 calc_minus, calc_plus 같은 연산 블록을 직접 넣으면 "[object Object]" 오류가 캔버스에 출력됩니다. 연산 결과를 말하게 하려면 반드시: (1) set_variable로 결과를 변수(예: "거스름돈")에 저장한 뒤, (2) dialog에는 get_variable로 그 변수를 참조하세요. 예: set_variable("거스름돈", calc_minus(money, 1500)) → dialog(get_variable("거스름돈"))

[code_json 작성 필수 예시 - 2가지 음료 자판기(거스름돈 포함, if_else 중첩 구조)]
"동전을 입금받고 1번 콜라(1500원), 2번 사이다(1000원) 중 선택하여 잔액을 차감하고 거스름돈을 알려주는 자판기 프로그램" 요청 시:
※ 거스름돈 출력 시 반드시 set_variable로 먼저 거스름돈 변수에 저장 후 get_variable로 dialog에 참조해야 합니다! calc_minus를 dialog에 직접 넣으면 캔버스에 [object Object]가 출력됩니다.
[
  [
    { "type": "when_run_button_click", "params": [] },
    { "type": "set_variable", "params": [ "money", { "type": "number", "params": [ 0 ] } ] },
    { "type": "set_variable", "params": [ "choice", { "type": "number", "params": [ 0 ] } ] },
    { "type": "set_variable", "params": [ "change", { "type": "number", "params": [ 0 ] } ] },
    { "type": "ask_and_wait", "params": [{ "type": "text", "params": ["입금할 금액을 입력하세요:"] }] },
    { "type": "set_variable", "params": [ "money", { "type": "get_canvas_input_value", "params": [] } ] },
    { "type": "ask_and_wait", "params": [{ "type": "text", "params": ["음료 번호를 입력하세요 (1:콜라 1500원, 2:사이다 1000원):"] }] },
    { "type": "set_variable", "params": [ "choice", { "type": "get_canvas_input_value", "params": [] } ] },
    {
      "type": "if_else",
      "params": [{ "type": "boolean_equal", "params": [ { "type": "get_variable", "params": ["choice"] }, { "type": "number", "params": [1] } ] }],
      "statements": [
        [
          {
            "type": "if_else",
            "params": [{ "type": "boolean_bigger", "params": [ { "type": "get_variable", "params": ["money"] }, { "type": "number", "params": [1499] } ] }],
            "statements": [
              [
                { "type": "dialog", "params": [{ "type": "text", "params": ["콜라를 드립니다!"] }] },
                {
                  "type": "set_variable",
                  "params": [ "change", { "type": "calc_minus", "params": [ { "type": "get_variable", "params": ["money"] }, { "type": "number", "params": [1500] } ] } ]
                },
                { "type": "dialog", "params": [{ "type": "text", "params": ["거스름돈은"] }] },
                { "type": "dialog", "params": [{ "type": "get_variable", "params": ["change"] }] },
                { "type": "dialog", "params": [{ "type": "text", "params": ["원입니다!"] }] }
              ],
              [
                { "type": "dialog", "params": [{ "type": "text", "params": ["잔액이 부족합니다!"] }] }
              ]
            ]
          }
        ],
        [
          {
            "type": "if_else",
            "params": [{ "type": "boolean_bigger", "params": [ { "type": "get_variable", "params": ["money"] }, { "type": "number", "params": [999] } ] }],
            "statements": [
              [
                { "type": "dialog", "params": [{ "type": "text", "params": ["사이다를 드립니다!"] }] },
                {
                  "type": "set_variable",
                  "params": [ "change", { "type": "calc_minus", "params": [ { "type": "get_variable", "params": ["money"] }, { "type": "number", "params": [1000] } ] } ]
                },
                { "type": "dialog", "params": [{ "type": "text", "params": ["거스름돈은"] }] },
                { "type": "dialog", "params": [{ "type": "get_variable", "params": ["change"] }] },
                { "type": "dialog", "params": [{ "type": "text", "params": ["원입니다!"] }] }
              ],
              [
                { "type": "dialog", "params": [{ "type": "text", "params": ["잔액이 부족합니다!"] }] }
              ]
            ]
          }
        ]
      ]
    }
  ]
]

유해한 비속어나 코딩과 완전히 무관한 질문이 들어오면 정중하게 거부하는 텍스트만 전달하세요.`;

            // Build sanitized multi-turn messages array from history + current prompt
            const formattedMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
            if (Array.isArray(history)) {
                for (const h of history) {
                    if (h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim()) {
                        formattedMessages.push({
                            role: h.role,
                            content: h.content.trim(),
                        });
                    }
                }
            }

            // Ensure first message is role 'user' (Anthropic API constraint)
            while (formattedMessages.length > 0 && formattedMessages[0].role !== 'user') {
                formattedMessages.shift();
            }

            // Append current prompt
            formattedMessages.push({ role: 'user', content: prompt });

            // Merge consecutive messages of the same role if any
            const sanitizedMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
            for (const msg of formattedMessages) {
                if (sanitizedMessages.length > 0 && sanitizedMessages[sanitizedMessages.length - 1].role === msg.role) {
                    sanitizedMessages[sanitizedMessages.length - 1].content += `\n${msg.content}`;
                } else {
                    sanitizedMessages.push({ ...msg });
                }
            }

            let finalSystemPrompt = systemPrompt;
            if (Array.isArray(variableNames) && variableNames.length > 0) {
                finalSystemPrompt += `\n\n[현재 프로젝트에 등록된 변수 목록]\n다음은 현재 엔트리 프로젝트에 이미 등록된 변수 이름들입니다: [${variableNames.join(', ')}]\n동일하거나 유사한 목적으로 사용되는 변수는 새로운 이름을 짓지 말고, 위 목록에 있는 변수 이름을 그대로 재사용하여 code_json을 작성하세요.`;
            }

            logger.info(`[IPC][Claude] Sending ${sanitizedMessages.length} message(s) in conversation history (existing vars: ${Array.isArray(variableNames) ? variableNames.length : 0}).`);

            const requestBody = JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 4096,
                system: finalSystemPrompt,
                messages: sanitizedMessages,
                tools: [
                    {
                        name: 'emit_code_assistant_response',
                        description: 'Emit structured response containing explanation text and Entry.js block JSON array.',
                        input_schema: {
                            type: 'object',
                            properties: {
                                text: {
                                    type: 'string',
                                    description: 'Friendly Korean explanation text for primary school students.',
                                },
                                code_json: {
                                    type: 'array',
                                    description: 'Entry.js 2D thread JSON array containing executable code blocks for the requested program.',
                                },
                            },
                            required: ['text', 'code_json'],
                        },
                    },
                ],
                tool_choice: {
                    type: 'tool',
                    name: 'emit_code_assistant_response',
                },
            });

            return new Promise((resolve) => {
                const req = https.request(
                    {
                        hostname: 'api.anthropic.com',
                        path: '/v1/messages',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-api-key': apiKey,
                            'anthropic-version': '2023-06-01',
                            'Content-Length': Buffer.byteLength(requestBody),
                        },
                    },
                    (res: any) => {
                        let data = '';
                        res.on('data', (chunk: any) => {
                            data += chunk;
                        });
                        res.on('end', () => {
                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                try {
                                    const parsed = JSON.parse(data);
                                    let outputText = '';
                                    let codeJson: any = null;

                                    logger.info(`[IPC][Claude] Response stop_reason: ${parsed.stop_reason}, usage: ${JSON.stringify(parsed.usage)}`);

                                    if (parsed.content && Array.isArray(parsed.content)) {
                                        const toolUseContent = parsed.content.find((c: any) => c.type === 'tool_use');
                                        if (toolUseContent && toolUseContent.input) {
                                            outputText = toolUseContent.input.text || '';
                                            codeJson = toolUseContent.input.code_json || null;
                                            logger.info(`[IPC][Claude] tool_use input code_json present? ${codeJson !== null && codeJson !== undefined}`);
                                        } else {
                                            const textContent = parsed.content.find((c: any) => c.type === 'text');
                                            if (textContent) {
                                                outputText = textContent.text || '';
                                            }
                                        }
                                    }

                                    // Double validation against block type whitelist
                                    const isValid = validateBlockJsonTypes(codeJson);
                                    logger.info(`[BlockValidator] Validation result for code_json: ${isValid}`);
                                    if (!isValid || !codeJson || !Array.isArray(codeJson) || codeJson.length === 0) {
                                        logger.warn('[BlockValidator] code_json invalidated or empty.');
                                        codeJson = null;
                                        if (!outputText.includes('코드를 아직 다 만들지 못했어요')) {
                                            outputText += '\n\n💡 *(코드를 아직 다 만들지 못했어요. 원하는 동작을 포함하여 다시 한번 요청해 주세요!)*';
                                        }
                                    }

                                    resolve({ text: outputText, code_json: codeJson, isValidTypes: isValid });
                                } catch (e: any) {
                                    resolve({ text: data, code_json: null, isValidTypes: false });
                                }
                            } else {
                                resolve({ text: `API 호출 에러 [HTTP ${res.statusCode}]: ${data}`, code_json: null, isValidTypes: false });
                            }
                        });
                    }
                );

                req.on('error', (err: any) => {
                    resolve({ text: `네트워크 오류: ${err.message}`, code_json: null, isValidTypes: false });
                });

                req.write(requestBody);
                req.end();
            });
        });
    }

    async saveProject(event: IpcMainInvokeEvent, project: ObjectLike, targetPath: string) {
        logger.verbose(`saveProject called, ${targetPath}`);
        return await MainUtils.saveProject(project, targetPath);
    }

    async loadProject(event: IpcMainInvokeEvent, filePath: string) {
        logger.verbose(`loadProject called, ${filePath}`);
        try {
            return await MainUtils.loadProject(filePath);
        } catch (e) {
            logger.error('loadProject failed, ${e.message}');
            throw e;
        }
    }

    async resetSaveDirectory() {
        logger.verbose('resetSaveDirectory called');
        await MainUtils.resetSaveDirectory();
    }

    async exportObject(event: IpcMainInvokeEvent, filePath: string, object: any) {
        logger.verbose(`exportObject called, ${filePath}`);
        await MainUtils.exportObject(filePath, object);
    }

    async importObjects(event: IpcMainInvokeEvent, filePaths: string[]) {
        logger.verbose(`importObjects called, ${filePaths}`);
        if (!filePaths || filePaths.length === 0) {
            return [];
        }

        return await MainUtils.importObjects(filePaths);
    }

    async importObjectsFromResource(event: IpcMainInvokeEvent, objects: ObjectLike[]) {
        if (!objects || objects.length === 0) {
            logger.warn('importObjectsFromResource event called with no objects argument');
            return [];
        }

        return await MainUtils.importObjectsFromResource(objects);
    }

    // 외부 이미지 업로드시.
    async importPictures(event: IpcMainInvokeEvent, filePaths: string[]) {
        logger.verbose(`importPictures called ${filePaths}`);
        if (!filePaths || filePaths.length === 0) {
            return [];
        }

        return await MainUtils.importPicturesToTemp(filePaths, event.sender);
    }

    async importPicturesFromResource(event: IpcMainInvokeEvent, pictures: ObjectLike[]) {
        return await MainUtils.importPicturesFromResource(pictures);
    }

    async importPictureFromCanvas(event: IpcMainInvokeEvent, data: ObjectLike[]) {
        logger.verbose('importPictureFromCanvas called');
        return await MainUtils.importPictureFromCanvas(data);
    }

    async captureBlockImage(event: IpcMainInvokeEvent, images: any, filePath: string) {
        return await MainUtils.captureBlockImage(images, filePath);
    }

    async importSounds(event: IpcMainInvokeEvent, filePaths: string[]) {
        logger.verbose(`importSounds called ${filePaths}`);
        if (!filePaths || filePaths.length === 0) {
            return [];
        }

        return await MainUtils.importSoundsToTemp(filePaths);
    }

    async importSoundsFromResource(event: IpcMainInvokeEvent, sounds: ObjectLike[]) {
        return await MainUtils.importSoundsFromResource(sounds);
    }

    async createTables(event: IpcMainInvokeEvent, filePaths: string[]) {
        return await Promise.all(
            filePaths.map(DataTableManager.makeTableInfo.bind(DataTableManager))
        );
    }

    async getTable(event: IpcMainInvokeEvent, hashId: string) {
        return DataTableManager.getTable(hashId);
    }

    /**
     * main/static 아래의 데이터를 다운로드 한다.
     * @param event
     * @param {Array<string>}unresolvedFilePathArray separator 가 없는 경로 목록
     * @param targetFilePath
     */
    async staticDownload(
        event: IpcMainInvokeEvent,
        unresolvedFilePathArray: string[],
        targetFilePath: string
    ) {
        const resolvedFilePath = path.join(...unresolvedFilePathArray);
        const staticFilePath = path.resolve(
            app.getAppPath(),
            'src',
            'main',
            'static',
            resolvedFilePath
        );
        await MainUtils.downloadFile(staticFilePath, targetFilePath).catch((err) => {
            console.error(err);
        });
    }

    /**
     * temp 에 있는 리소스를 다운로드 한다. fileurl 이 있는 경우 이를 우선한다.
     * 이미지, 사운드 개별 다운로드에 사용된다.
     *
     * @param event
     * @param {Object}entryObject 다운로드할 엔트리 오브젝트 정보. fileurl 이 존재하면 이 경로를 우선한다.
     * @param {string=}type 경로를 결정할 타입. image, sound 중 하나
     * @param {string}targetFilePath
     */
    async tempResourceDownload(
        event: IpcMainInvokeEvent,
        entryObject: any,
        type: string,
        targetFilePath: string
    ) {
        let typedPath = '';
        if (entryObject.fileurl) {
            typedPath = entryObject.fileurl;
            // 기본 이미지 및 사운드인 경우 상대경로이므로 기준 위치 수정
            if (typedPath.startsWith('renderer')) {
                typedPath = path.resolve(app.getAppPath(), 'src', typedPath);
            } else if (typedPath.startsWith('../../..')) {
                typedPath = typedPath.replace('../../../', '');
                typedPath = path.resolve(app.getAppPath(), typedPath);
            }
        } else {
            switch (type) {
                case 'image':
                    typedPath = path.join(
                        Constants.tempImagePath(entryObject.filename),
                        CommonUtils.getFileNameWithExtension(entryObject, 'png')
                    );
                    break;
                case 'sound':
                    typedPath = path.join(
                        Constants.tempSoundPath(entryObject.filename),
                        CommonUtils.getFileNameWithExtension(entryObject, 'mp3')
                    );
                    break;
            }
        }

        if (typedPath === '') {
            throw new Error('invalid Type');
        } else {
            return await MainUtils.downloadFile(typedPath, targetFilePath);
        }
    }

    async saveExcel(event: IpcMainInvokeEvent, filePath: string, array: any[]) {
        return await MainUtils.saveExcel(filePath, array);
    }

    async writeFile(event: IpcMainInvokeEvent, data: any, filePath: string) {
        return await MainUtils.writeFile(data, filePath);
    }

    quitApplication() {
        app.quit();
    }

    async checkPermission(event: IpcMainInvokeEvent, type: 'microphone' | 'camera') {
        if (process.platform === 'darwin') {
            logger.info(`[MacOS] input Media ${type} permission requested,`);
            const accessStatus = systemPreferences.getMediaAccessStatus(type);
            if (accessStatus !== 'granted') {
                await systemPreferences.askForMediaAccess('microphone');
                await systemPreferences.askForMediaAccess('camera');
            }
        }
    }

    async checkIsValidAsarFile(event: IpcMainInvokeEvent) {
        try {
            const result = await isValidAsarFile();
            console.log('isValidAsarFile', result);
            return result;
        } catch (e) {
            console.log(e);
            return false;
        }
    }

    async checkUpdate() {
        const data = await checkUpdateRequest();
        return [global.sharedObject.version, data];
    }

    async saveSoundBuffer(event: IpcMainInvokeEvent, buffer: ArrayBuffer, prevFileUrl: string) {
        return MainUtils.saveSoundBuffer(buffer, prevFileUrl);
    }

    async getExistSoundFilePath(event: IpcMainInvokeEvent, sound: any) {
        return fileUtils.getExistSoundFilePath(sound);
    }

    async getPapagoHeaderInfo(event: IpcMainInvokeEvent) {
        return await getPapagoHeaderInfoByValidator();
    }

    openUrl(event: IpcMainInvokeEvent, url: string) {
        logger.info(`openUrl called : ${url}`);
        shell.openExternal(url);
    }
})();
