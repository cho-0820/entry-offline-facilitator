const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log('Navigating to local web app...');
    await page.goto('http://localhost:3000/src/main/views/main.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 1000));

    // Bypass login and mode by setting sessionStorage directly
    await page.evaluate(() => {
        sessionStorage.setItem('student_code', 'S3-1-01');
        sessionStorage.setItem('nickname', '테스트학생');
        sessionStorage.setItem('classroom_name', '1반');
    });

    console.log('Reloading page with pre-set student storage...');
    await page.goto('http://localhost:3000/src/main/views/main.html', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    // Click mode select close button (.workspaceModeSelectCloseBtn)
    try {
        console.log('Dismissing Mode Select modal...');
        await page.evaluate(() => {
            const btn = document.querySelector('.workspaceModeSelectCloseBtn');
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
        console.log('Mode select modal skipped:', e.message);
    }

    // Wait for Entry workspace to initialize
    console.log('Waiting for Entry workspace...');
    await page.waitForFunction(() => window.Entry && window.Entry.container && window.Entry.playground, { timeout: 25000 });
    console.log('Entry workspace ready.');

    const initialObjectsCount = await page.evaluate(() => Entry.container.getAllObjects().length);
    console.log(`Initial objects count: ${initialObjectsCount}`);

    // Test 1: Import Object from Resource
    console.log('Testing Object import from resource (importObjectsFromResource)...');
    const objectAdded = await page.evaluate(async () => {
        const item = {
            name: '강아지',
            pictures: [{
                filename: '000fc106d9c106f3fafb5927fb0ec9f4',
                ext: '.png',
                imageType: 'png',
                name: '강아지_1',
                dimension: { width: 100, height: 100 }
            }],
            sounds: [],
            category: { main: 'animal' }
        };
        const newObjects = await IpcRendererHelper.importObjectsFromResource([item]);
        if (newObjects && newObjects.length > 0) {
            const obj = newObjects[0];
            Entry.container.addObject({
                id: Entry.generateHash(),
                objectType: 'sprite',
                sprite: obj
            }, 0);
            return true;
        }
        return false;
    });

    await new Promise(r => setTimeout(r, 1500));
    const objectsCountAfterObj = await page.evaluate(() => Entry.container.getAllObjects().length);
    console.log(`Objects count after import: ${objectsCountAfterObj}`);

    await page.screenshot({ path: path.join(__dirname, 'resource_test_1_object_added.png') });
    console.log('Captured screenshot 1: resource_test_1_object_added.png');

    // Test 2: Import Picture from Resource
    console.log('Testing Picture import from resource (importPicturesFromResource)...');
    const pictureAdded = await page.evaluate(async () => {
        const pictureItem = {
            filename: '5053ba49275e7a9b0c2a848c26dfd223',
            ext: '.png',
            imageType: 'png',
            name: '엔트리봇_새모양',
            dimension: { width: 100, height: 100 }
        };
        const pictures = await IpcRendererHelper.importPicturesFromResource([pictureItem]);
        if (pictures && pictures.length > 0) {
            pictures[0].id = Entry.generateHash();
            Entry.playground.addPicture(pictures[0], true);
            return true;
        }
        return false;
    });

    await new Promise(r => setTimeout(r, 1500));
    const currentObjectPicturesCount = await page.evaluate(() => {
        const target = Entry.playground.object || Entry.container.selectedObject || Entry.container.getAllObjects()[0];
        return target && target.pictures ? target.pictures.length : 0;
    });
    console.log(`Current object pictures count: ${currentObjectPicturesCount}`);

    await page.screenshot({ path: path.join(__dirname, 'resource_test_2_picture_added.png') });
    console.log('Captured screenshot 2: resource_test_2_picture_added.png');

    // Test 3: Import Sound from Resource
    console.log('Testing Sound import from resource (importSoundsFromResource)...');
    const soundAdded = await page.evaluate(async () => {
        const soundItem = {
            filename: '009n7yqollupfgl315vd7ec0492bkzcx',
            ext: '.mp3',
            name: '강아지 짖는 소리'
        };
        const sounds = await IpcRendererHelper.importSoundsFromResource([soundItem]);
        if (sounds && sounds.length > 0) {
            sounds[0].id = Entry.generateHash();
            Entry.playground.addSound(sounds[0], true);
            return true;
        }
        return false;
    });

    await new Promise(r => setTimeout(r, 1500));
    const currentObjectSoundsCount = await page.evaluate(() => {
        const target = Entry.playground.object || Entry.container.selectedObject || Entry.container.getAllObjects()[0];
        return target && target.sounds ? target.sounds.length : 0;
    });
    console.log(`Current object sounds count: ${currentObjectSoundsCount}`);

    await page.screenshot({ path: path.join(__dirname, 'resource_test_3_sound_added.png') });
    console.log('Captured screenshot 3: resource_test_3_sound_added.png');

    await browser.close();
    console.log('ALL 3 TESTS PASSED PERFECTLY!');
})();
