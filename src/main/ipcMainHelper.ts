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

        ipcMain.handle('callCodeAssistantApi', async (event: IpcMainInvokeEvent, prompt: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []) => {
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
                },
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
                            if (!node.statements || !Array.isArray(node.statements) || node.statements.length === 0 || !Array.isArray(node.statements[0]) || node.statements[0].length === 0) {
                                logger.warn(`[BlockValidator] Container block "${node.type}" has empty or missing statements array! Invalidation triggered.`);
                                return false;
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
5. [자료] 카테고리 (변수/리스트/입력/대답):
   - "ask_and_wait": '_ 을(를) 묻고 대답 기다리기' (예: '얼마를 저금할까요? 을(를) 묻고 대답 기다리기')
   - "get_canvas_input_value": '대답' (값 파라미터 블록, params: [])
   - "get_variable": [변수 이름]
   - "set_variable": '[변수 이름] 를 _ (으)로 정하기'
   - "value_of_index_from_list": '[리스트 이름] 의 _ 번째 항목'
6. [계산] 카테고리:
   - "calc_plus": '_ + _', "calc_minus": '_ - _', "calc_times": '_ * _', "calc_divide": '_ / _'

[가독성 향상 지침]
- 설명 텍스트 작성 시 중요한 블록 이름이나 카테고리 이름은 **굵은 글씨** (예: **[자료]** 카테고리의 **'얼마를 저금할까요? 을(를) 묻고 대답 기다리기'** 블록)로 강조하세요.
- 각 설명 항목은 불릿 리스트('- ')와 줄바꿈(\\n)을 활용하여 깔끔하고 보기 쉽게 작성하세요.

[감싸는 구조(컨테이너) 블록 및 중첩 작성 필수 지침]
1. "repeat_basic" 처럼 내부에 다른 블록을 담는 감싸는 구조(container) 블록은 반드시 \`statements\` 필드에 2차원 배열 형태로 자식 블록 스레드를 넣어야 합니다 (예: \`statements: [[ childBlock1, childBlock2 ]]\`).
2. statements가 없거나 빈 배열이면 텅 빈 반복문이 되어 캔버스에서 아무런 동작도 하지 않습니다! 반복문 안에 블록을 넣어야 하는 요청이 들어오면 반드시 statements 내부에 자식 블록들을 넣으세요.

[엄격한 블록 스펙 및 스레드 시작 규칙]
1. 모든 블록 스레드 배열의 첫 번째 블록은 반드시 시작 이벤트 블록인 "when_run_button_click" 이어야 합니다!
2. "when_run_button_click": params는 반드시 빈 배열 [] 이어야 함 (params: []).
3. "ask_and_wait": params는 정확히 1개 (질문 텍스트). (예: { "type": "ask_and_wait", "params": [{ "type": "text", "params": ["입금할 금액을 입력하세요:"] }] })
4. "get_canvas_input_value": params는 빈 배열 [] 이어야 함 (params: []). 계산이나 변수 정하기 인자로 사용함.
5. "move_direction": params는 정확히 1개(이동 거리 숫자).
6. "rotate_by_angle": params는 정확히 1개.
7. "dialog_time": params는 정확히 2개 (말할 내용, 시간 숫자).
8. "dialog": params는 정확히 1개 (말할 내용).
9. "repeat_basic": params는 정확히 1개 (반복 횟수 숫자). 반드시 statements 내부에 반복 실행할 블록들을 배열로 포함해야 합니다.
10. 모든 파라미터는 중첩 객체 형태로 작성해야 합니다 (예: { "type": "number", "params": [10] }).

[code_json 작성 필수 예시 - 반복문 및 입출력 중첩 구조]
"저금통에 돈을 입금하고 합계를 출력하는 프로그램"과 같이 반복이나 입출력이 필요한 요청에는 반드시 다음과 같이 repeat_basic의 statements 안에 ask_and_wait, set_variable, dialog 블록을 올바르게 중첩한 2차원 배열을 반환하세요:
[
  [
    { "type": "when_run_button_click", "params": [] },
    {
      "type": "repeat_basic",
      "params": [{ "type": "number", "params": [10] }],
      "statements": [
        [
          {
            "type": "ask_and_wait",
            "params": [{ "type": "text", "params": ["입금할 금액을 입력하세요:"] }]
          },
          {
            "type": "set_variable",
            "params": [
              "money",
              {
                "type": "calc_plus",
                "params": [
                  { "type": "get_variable", "params": ["money"] },
                  { "type": "get_canvas_input_value", "params": [] }
                ]
              }
            ]
          },
          {
            "type": "dialog",
            "params": [
              { "type": "get_variable", "params": ["money"] }
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

            logger.info(`[IPC][Claude] Sending ${sanitizedMessages.length} message(s) in conversation history.`);

            const requestBody = JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1024,
                system: systemPrompt,
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
                                    description: 'Entry.js 2D thread JSON array. Leave empty array if no code is generated.',
                                },
                            },
                            required: ['text'],
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

                                    if (parsed.content && Array.isArray(parsed.content)) {
                                        const toolUseContent = parsed.content.find((c: any) => c.type === 'tool_use');
                                        if (toolUseContent && toolUseContent.input) {
                                            outputText = toolUseContent.input.text || '';
                                            codeJson = toolUseContent.input.code_json || null;
                                        } else {
                                            const textContent = parsed.content.find((c: any) => c.type === 'text');
                                            if (textContent) {
                                                outputText = textContent.text || '';
                                            }
                                        }
                                    }

                                    // Double validation against block type whitelist
                                    const isValid = validateBlockJsonTypes(codeJson);
                                    if (!isValid) {
                                        logger.warn('[BlockValidator] code_json invalidated due to unapproved block types.');
                                        codeJson = null;
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
