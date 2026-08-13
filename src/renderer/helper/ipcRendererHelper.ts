import RendererUtils from './rendererUtils';
import StorageManager from './storageManager';
import EntryModalHelper from './entry/entryModalHelper';
import eventLogger from './logger/eventLogger';

const { ipcInvoke } = window;

/**
 * electron main process 로 통신하기 위해 사용하는 클래스.
 * nodejs lib 사용 혹은 main 에 통신이 한번이상 필요한 경우 이쪽에 둔다.
 */

// Helper to convert blob URLs in pictures/sounds to base64 data URLs for JSON storage
async function serializeProjectForWeb(project: any): Promise<any> {
    const projectCopy = JSON.parse(JSON.stringify(project));
    if (projectCopy.objects && Array.isArray(projectCopy.objects)) {
        for (const obj of projectCopy.objects) {
            if (obj.sprite && obj.sprite.pictures) {
                for (const pic of obj.sprite.pictures) {
                    if (pic.fileurl && pic.fileurl.startsWith('blob:')) {
                        try {
                            const res = await fetch(pic.fileurl);
                            const blob = await res.blob();
                            const base64 = await new Promise<string>((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result as string);
                                reader.readAsDataURL(blob);
                            });
                            pic.fileurl = base64;
                        } catch (e) {
                            console.warn('[WebSave] Failed to convert picture blob to base64:', e);
                        }
                    }
                }
            }
            if (obj.sprite && obj.sprite.sounds) {
                for (const snd of obj.sprite.sounds) {
                    if (snd.fileurl && snd.fileurl.startsWith('blob:')) {
                        try {
                            const res = await fetch(snd.fileurl);
                            const blob = await res.blob();
                            const base64 = await new Promise<string>((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result as string);
                                reader.readAsDataURL(blob);
                            });
                            snd.fileurl = base64;
                        } catch (e) {
                            console.warn('[WebSave] Failed to convert sound blob to base64:', e);
                        }
                    }
                }
            }
        }
    }
    return projectCopy;
}

export default class {
    static async loadProject(filePath?: string) {
        if (window.ipcInvoke && !(window.ipcInvoke as any).isMock) {
            const project = await ipcInvoke<IEntry.Project>('loadProject', filePath!);
            if (project && (project as any).messages) {
                (window as any).__ENTRY_LOADED_MESSAGES__ = (project as any).messages;
                console.log('[Phase6] Loaded custom messages array from project:', (project as any).messages);
            }
            return project;
        }

        // Web environment: GET /api/projects?student_code=...&include_data=true
        const studentCode = sessionStorage.getItem('student_code');
        if (!studentCode) {
            console.warn('[WebLoad] No student_code in sessionStorage.');
            return undefined;
        }

        const baseUrl = process.env.FACILITATOR_API_URL
            ? `${process.env.FACILITATOR_API_URL.replace(/\/api\/chat$/, '')}/api/projects`
            : 'https://facilitator-api.vercel.app/api/projects';

        const url = `${baseUrl}?student_code=${encodeURIComponent(studentCode)}&include_data=true`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`[WebLoad] GET /api/projects failed (status ${response.status})`);
                return undefined;
            }

            const data = await response.json();
            const projects = data.projects;
            if (!projects || projects.length === 0) {
                console.log('[WebLoad] No saved projects found on server for student:', studentCode);
                return undefined;
            }

            // Automatically load the most recent project (projects[0])
            const recentProject = projects[0];
            const projectData = recentProject.project_data;
            if (projectData && (projectData as any).messages) {
                (window as any).__ENTRY_LOADED_MESSAGES__ = (projectData as any).messages;
                console.log('[Phase6-Web] Loaded custom messages array from web project:', (projectData as any).messages);
            }
            console.log('[WebLoad] Successfully loaded project from server:', recentProject.project_name);
            return projectData;
        } catch (e) {
            console.error('[WebLoad] Error loading project from web API:', e);
            return undefined;
        }
    }

    static async saveProject(project: IEntry.Project, targetPath?: string) {
        // Phase 6: Save conversation messages ONLY if data collection consent is granted
        if (eventLogger.getIsDataCollectionEnabled()) {
            const aiMessages = (window as any).__ENTRY_AI_MESSAGES__ || [];
            (project as any).messages = aiMessages;
            console.log(`[Phase6] Saving project with ${aiMessages.length} custom messages (consent=granted).`);
        } else {
            delete (project as any).messages;
            console.log('[Phase6] Saving project WITHOUT messages (consent=denied/false).');
        }

        if (window.ipcInvoke && !(window.ipcInvoke as any).isMock) {
            return ipcInvoke<void>('saveProject', project, targetPath!);
        }

        // Web environment: POST /api/projects { student_code, project_name, project_data }
        const studentCode = sessionStorage.getItem('student_code');
        if (!studentCode) {
            console.warn('[WebSave] No student_code in sessionStorage.');
            return;
        }

        const projectName = (project as any).name || (targetPath ? targetPath.replace(/\.ent$/, '') : '마이 프로젝트');
        const serializedData = await serializeProjectForWeb(project);

        const baseUrl = process.env.FACILITATOR_API_URL
            ? `${process.env.FACILITATOR_API_URL.replace(/\/api\/chat$/, '')}/api/projects`
            : 'https://facilitator-api.vercel.app/api/projects';

        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                student_code: studentCode,
                project_name: projectName,
                project_data: serializedData,
            }),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Failed to save project (HTTP ${response.status})`);
        }

        const result = await response.json();
        console.log('[WebSave] Project saved successfully to web server:', result);
        return result;
    }

    static resetDirectory() {
        if (window.ipcInvoke && !(window.ipcInvoke as any).isMock) {
            return ipcInvoke<void>('resetDirectory');
        }
        return Promise.resolve();
    }

    static async downloadExcel(filename: string, array: any[]) {
        const filePath = await RendererUtils.showSaveDialogAsync({
            title: RendererUtils.getLang('Workspace.file_save'),
            defaultPath: `${filename}.xlsx`,
            filters: [
                { name: 'Excel Files (*.xlsx)', extensions: ['xlsx'] },
                { name: 'All Files (*.*)', extensions: ['*'] },
            ],
        });
        await ipcInvoke('saveExcel', filePath, array);
    }

    static staticDownload(unresolvedPath: string[], targetFilePath: string) {
        ipcInvoke('staticDownload', unresolvedPath, targetFilePath);
    }

    static tempResourceDownload(entryObject: IEntry.Object, type: string, targetFilePath: string) {
        const convertObject = { fileurl: entryObject.fileurl, filename: entryObject.name };
        ipcInvoke('tempResourceDownload', convertObject, type, targetFilePath);
    }

    static writeFile(data: any, filePath: string) {
        ipcInvoke('writeFile', data, filePath);
    }

    static importPictureFromCanvas(data: any) {
        return ipcInvoke<IEntry.Picture>('importPictureFromCanvas', data);
    }

    static captureBlockImage(images: any, savePath: string) {
        return ipcInvoke<string>('captureBlockImage', images, savePath);
    }

    /**
     * 오브젝트를 eo 파일로 만들어서 외부로 저장한다.
     * 이 이벤트는 일반적으로 entryUtils 를 거쳐서 발생된다.
     * 인식가능한 형태로 만들기 전에 선처리 로직이 있기 때문이다.
     *
     * @see entryUtils.exportObject
     * @param filePath 저장할 파일 전체경로
     * @param objectVariable
     */
    static exportObject(filePath: string, objectVariable: any) {
        return ipcInvoke<void>('exportObject', filePath, objectVariable);
    }

    static importObjects(filePaths: string[]) {
        return ipcInvoke<IEntry.Object[]>('importObjects', filePaths);
    }

    static importObjectsFromResource(objects: any) {
        return ipcInvoke<IEntry.Object[]>('importObjectsFromResource', objects);
    }

    /**
     * 업로드 파일 경로를 temp 로 가져온다.
     * @param {Array!}filePaths 이미지 파일 경로
     * @return {Promise<Object>} 신규생성된 오브젝트 메타데이터
     */
    static importPictures(filePaths: string[]) {
        return ipcInvoke<IEntry.Picture[]>('importPictures', filePaths);
    }

    /**
     * 리소스 디렉토리에서 파일을 temp 로 가져온다.
     * @param {Array}pictures DB 에서 가져온 이미지 정보 오브젝트
     * @return {Promise<Object>} 파일명이 변경된 이미지 정보 오브젝트
     */
    static importPicturesFromResource(pictures: string[]) {
        return ipcInvoke<IEntry.Picture[]>('importPicturesFromResource', pictures);
    }

    static importSounds(filePath: string[]) {
        return ipcInvoke<IEntry.Sound[]>('importSounds', filePath);
    }

    static importSoundsFromResource(sounds: any[]) {
        return ipcInvoke<IEntry.Sound[]>('importSoundsFromResource', sounds);
    }

    static createTableInfo(filePaths: string[]) {
        return ipcInvoke('createTableInfo', filePaths);
    }

    static getTable(hashId: string) {
        return ipcInvoke('getTable', hashId);
    }

    static openHardwarePage() {
        window.openHardwarePage();
    }

    static async checkUpdate() {
        const [currentVersion, { hasNewVersion, recentVersion: latestVersion }] = await ipcInvoke<
            [string, { hasNewVersion: string; recentVersion: string }]
        >('checkUpdate');
        /**
         latestVersion properties
         @property hasNewVersion{boolean} 요청을 보냈을때의 버전과 비교하여 업데이트가 필요한지 여부
         @property padded_version{string} ex) '0002.0000.0002' 비교를 위한 패딩
         @property version{string} ex) 2.0.2 원래 버전
         @property _id{string} ex) 저장된 mongoDB 오브젝트 ID
         */
        console.log(
            `currentVersion : ${currentVersion}\nrecentVersion: ${latestVersion}\nneedUpdate: ${hasNewVersion}`
        );
        const lastDontShowCheckedVersion = StorageManager.getLastDontShowVersion();
        // 다시보지않음을 클릭하지 않았거나, 클릭했지만 당시보다 더 높은 버전이 나온 경우 출력
        if (
            latestVersion > currentVersion &&
            (!lastDontShowCheckedVersion || latestVersion > lastDontShowCheckedVersion)
        ) {
            EntryModalHelper.showUpdateCheckModal(latestVersion);
            StorageManager.setLastCheckedVersion(latestVersion);
        }
    }

    static openEntryWebPage() {
        window.openEntryWebPage();
    }

    static checkAudioPermission() {
        return window.checkPermission('microphone');
    }
    static checkVideoPermission() {
        return window.checkPermission('camera');
    }

    static saveSoundBuffer(buffer: ArrayBuffer, prevFileUrl: string) {
        return ipcInvoke('saveSoundBuffer', buffer, prevFileUrl);
    }

    static getExistSoundFilePath(sound: { filename: string; ext?: string }) {
        return ipcInvoke('getExistSoundFilePath', sound);
    }

    static getAnthropicApiKeyInfo() {
        if (window.ipcInvoke && !(window.ipcInvoke as any).isMock) {
            return window.ipcInvoke<{ exists: boolean; maskedKey: string }>('getAnthropicApiKeyInfo');
        }
        return Promise.resolve({ exists: false, maskedKey: '' });
    }

    static callCodeAssistantApi(prompt: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []) {
        if (window.ipcInvoke && !(window.ipcInvoke as any).isMock) {
            return window.ipcInvoke<{ text: string; code_json?: any }>('callCodeAssistantApi', prompt, history);
        }
        const url = process.env.FACILITATOR_API_URL || 'https://facilitator-api.vercel.app/api/chat';
        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt,
                history,
            }),
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                return data as { text: string; code_json?: any };
            });
    }
}
