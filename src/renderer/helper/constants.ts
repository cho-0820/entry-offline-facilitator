export default class {
    static get sep() {
        return '/';
    }

    static get resourcePath() {
        return `src/renderer/resources/uploads/`;
    }

    static resourceImagePath(filename: string) {
        return `/${this.resourcePath}${this.resourceSubDirectoryPath(
            filename
        )}image/`;
    }

    static resourceThumbnailPath(filename: string) {
        return `/${this.resourcePath}${this.resourceSubDirectoryPath(filename)}thumb/`;
    }

    static resourceSoundPath(filename: string) {
        return `/${this.resourcePath}${this.resourceSubDirectoryPath(
            filename
        )}`;
    }

    static tempSoundPath(filename: string) {
        return `temp${this.sep}${this.tempSubDirectoryPath(filename)}sound${
            this.sep
        }${filename}.mp3`;
    }

    static resourceSubDirectoryPath(filename: string) {
        return `${filename.substr(0, 2)}${this.sep}${filename.substr(2, 2)}${this.sep}`;
    }

    static tempSubDirectoryPath(filename: string) {
        return `${filename.substr(0, 2)}${this.sep}${filename.substr(2, 2)}${this.sep}`;
    }
}
