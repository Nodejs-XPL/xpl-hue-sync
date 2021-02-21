import fetch, {RequestInit} from 'node-fetch';
import * as https from "https";
import * as fs from 'fs';
import * as os from 'os';
import * as Path from 'path';
import Debug from 'debug';

type HueSyncSyncMode = 'video' | 'game' | 'music' | 'ambient';
type HueSyncActiveMode = HueSyncSyncMode | 'powersave' | 'passthrough';
type HueSyncHdmiSource = 'hdmi1' | 'hdmi2' | 'hdmi3' | 'hdmi4';
type HueSyncIntensity = 'subtle' | 'moderate' | 'high' | 'intense';
type HueSyncNextPrevious = 'next' | 'previous';

class WSError extends Error {
    readonly #reason: any;

    constructor(message: string, reason: any) {
        super(message);
        this.#reason = reason;
    }

    get reason() {
        return this.#reason;
    }
}

interface HyeSyncVideo {
    intensity: HueSyncIntensity;
    backgroundLighting: boolean;
}

interface HyeSyncGame {
    intensity: HueSyncIntensity;
    backgroundLighting: boolean;
}

interface HueSyncMusic {
    intensity: HueSyncIntensity;
    palette: string;
}

interface HueSyncExecutionState {
    syncActive: boolean;
    hdmiActive: boolean;
    mode: HueSyncActiveMode;
    lastSyncMode: HueSyncSyncMode;
    hdmiSource: HueSyncHdmiSource;
    hueTarget: string,
    brightness: number,
    video: HyeSyncVideo;
    game: HyeSyncGame,
    music: HueSyncMusic,
}

interface HueSyncExecutionRequestState extends HueSyncExecutionState {
    toggleSyncActive: boolean,
    toggleHdmiActive: boolean,
    cycleSyncMode: HueSyncNextPrevious,
    cycleHdmiSource: HueSyncNextPrevious,
    incrementBrightness: number,
    cycleIntensity: HueSyncNextPrevious,
    intensity: HueSyncIntensity,
}

interface HueSyncState {

}

interface HueSyncDeviceState {

}

interface HueSyncExecutionRequest {
    syncActive(enabled: boolean): HueSyncExecutionRequest;

    hdmiActive(enabled: boolean): HueSyncExecutionRequest;

    mode(mode: HueSyncActiveMode): HueSyncExecutionRequest;

    hdmiSource(source: HueSyncHdmiSource): HueSyncExecutionRequest;

    run(): Promise<boolean>;
}

const debug = Debug('xpl-hue-sync:Hue-Sync');

const DEFAULT_INSTANCE_NAME = 'XPL-HUE-SYNC';
const DEFAULT_APP_NAME = 'XPL-HUE-SYNC';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

function asyncTimeout(timeMs: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, timeMs);
    });
}

interface RequestOptions extends RequestInit {
    json?: any;
}

interface HueSyncBoxOptions {
    host: string;
    instanceName?: string;
    appName?: string;
    bearer?: string;
}

export class HueSyncBox {
    readonly #host: string;
    readonly #instanceName: string;
    readonly #appName: string;
    readonly #url: string;
    readonly #bearerPath: string;
    #bearer: string | undefined;

    constructor(options: HueSyncBoxOptions) {
        this.#host = options.host;
        this.#instanceName = options.instanceName || DEFAULT_INSTANCE_NAME;
        this.#appName = options.appName || DEFAULT_APP_NAME;
        this.#bearerPath = options.bearer || Path.join(os.homedir(), 'hue-sync-bearer');

        this.#url = `https://${options.host}`;
    }

    async fetchAPI(apiPath: string, _options?: RequestOptions) {
        if (!this.#bearer) {
            throw new Error('Bearer is undefined');
        }

        const options: RequestOptions = {
            ..._options,
            headers: {
                authorization: `Bearer ${this.#bearer}`,
            },
            agent: httpsAgent,
        };

        if (options.json) {
            options.body = JSON.stringify(options.json);
            options.method = 'put';
            // @ts-ignore
            options.headers['content-type'] = 'application/json';
        }

        const url = this.#url + apiPath;

        const response = await fetch(url, options);

        if (response.status !== 200) {
            throw new Error('Invalid status=' + response.status);
        }

        const headers = response.headers;
        const contentType = headers.get('content-type');
        if (!contentType) {
            return null;
        }

        if (!contentType.indexOf('text/')) {
            const text = await response.text();
            return text;
        }

        if (!contentType.indexOf('application/json')) {
            const json = await response.json();
            return json;
        }

        const buffer = await response.buffer();
        return buffer;
    }

    async getInfos() {
        const result = await fetch(this.#url + '/api/v1/registrations', {agent: httpsAgent});
        const json = await result.json();

        return json;
    }

    async loadBearer(path?: string) {
        if (!path) {
            path = this.#bearerPath;
        }
        const content = await fs.promises.readFile(path, {encoding: 'utf8'});
        this.#bearer = content;
        return content;
    }

    async writeBearer(path?: string) {
        if (!this.#bearer) {
            throw new Error('Bearer is not defined');
        }
        if (!path) {
            path = this.#bearerPath;
        }

        const content = await fs.promises.writeFile(path, this.#bearer, {encoding: 'utf8'});

        return content;
    }

    async getAuthorizationToken() {
        const result = await fetch(this.#url + '/api/v1/registrations', {
            method: 'POST',
            agent: httpsAgent,
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({appName: this.#appName, instanceName: this.#instanceName}),
        });
        const json = await result.json();
        debug('getAuthorizationToken', 'Json=', json);

        console.log('**** YOU HAVE 3mn to click on the HUE SYNC BOX\'s button');

        await asyncTimeout(1000 * 10);

        const result2 = await fetch(this.#url, {
            method: 'POST',
            agent: httpsAgent,
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({appName: this.#appName, instanceName: this.#instanceName}),
        });
        const json2 = await result2.json();

        if (json2.code) {
            const error = new WSError('Invalid code #' + json2.code, json2);
            throw error;
        }

        debug('getAuthorizationToken', 'Json2=', json2);

        const bearer = json2.accessToken;
        if (!bearer) {
            const error = new WSError('Invalid response', json2);
            throw error;
        }
        this.#bearer = bearer;

        return bearer;
    }

    async getState(): Promise<HueSyncState> {
        const json = await this.fetchAPI('/api/v1');

        return json;
    }

    async getDeviceState(): Promise<HueSyncDeviceState> {
        const json = await this.fetchAPI(`/api/v1/device`);

        return json;
    }

    async getExecutionState(): Promise<HueSyncExecutionState> {
        const json = await this.fetchAPI(`/api/v1/execution`);

        return json as HueSyncExecutionState;
    }

    createExecutionRequests(): HueSyncExecutionRequest {
        const requestState: any = {};
        const fetchAPI = this.fetchAPI.bind(this);

        return {
            mode(syncMode: HueSyncSyncMode): HueSyncExecutionRequest {
                requestState.mode = syncMode;
                return this;
            },
            syncActive(enabled: boolean): HueSyncExecutionRequest {
                requestState.syncActive = enabled;
                return this;
            },
            hdmiActive(enabled: boolean): HueSyncExecutionRequest {
                requestState.hdmiActive = enabled;
                return this;
            },

            hdmiSource(source: HueSyncHdmiSource): HueSyncExecutionRequest {
                requestState.hdmiSource = source;
                return this;
            },
            brightness(brightness: number): HueSyncExecutionRequest {
                if (brightness < 0 || brightness > 200) {
                    throw new Error('Invalid brightness parameter');
                }
                requestState.brightness = brightness;
                return this;
            },
            incrementBrightness(incrementBrightness: number): HueSyncExecutionRequest {
                if (incrementBrightness < -200 || incrementBrightness > 200) {
                    throw new Error('Invalid incrementBrightness parameter');
                }
                requestState.incrementBrightness = incrementBrightness;
                return this;
            },
            intensity(intensity: HueSyncIntensity): HueSyncExecutionRequest {
                requestState.intensity = intensity;
                return this;
            },
            cycleIntensity(cycleIntensity: HueSyncNextPrevious): HueSyncExecutionRequest {
                requestState.cycleIntensity = cycleIntensity;
                return this;
            },

            async run(): Promise<boolean> {
                await fetchAPI('/api/v1/execution', {
                    json: requestState,
                });

                return true;
            },
        } as HueSyncExecutionRequest;
    }
}

/*
if (false) {
    const t = new HueSyncBox({host: '192.168.3.74'});

    t.getInfos().then((result) => {
        console.log(result);

        t.getAuthorizationToken().then(async (token) => {
            console.log('Token=', token);

            await t.writeBearer();

        }, (error) => {
            console.error('Get error', error);
        });
    });

    t.loadBearer().then(async () => {
        const executionState = await t.getExecutionState();
        console.log('executionState', executionState);

        const ret = await t.createExecutionRequests().mode('powersave').run();
        console.log('ret=', ret);
    });
}
*/
