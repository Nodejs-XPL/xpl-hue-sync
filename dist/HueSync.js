var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, privateMap, value) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to set private field on non-instance");
    }
    privateMap.set(receiver, value);
    return value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, privateMap) {
    if (!privateMap.has(receiver)) {
        throw new TypeError("attempted to get private field on non-instance");
    }
    return privateMap.get(receiver);
};
var _reason, _host, _instanceName, _appName, _url, _bearerPath, _bearer;
import fetch from 'node-fetch';
import * as https from "https";
import * as fs from 'fs';
import * as os from 'os';
import * as Path from 'path';
import Debug from 'debug';
class WSError extends Error {
    constructor(message, reason) {
        super(message);
        _reason.set(this, void 0);
        __classPrivateFieldSet(this, _reason, reason);
    }
    get reason() {
        return __classPrivateFieldGet(this, _reason);
    }
}
_reason = new WeakMap();
const debug = Debug('xpl-hue-sync:Hue-Sync');
const DEFAULT_INSTANCE_NAME = 'XPL-HUE-SYNC';
const DEFAULT_APP_NAME = 'XPL-HUE-SYNC';
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});
function asyncTimeout(timeMs) {
    return new Promise((resolve) => {
        setTimeout(resolve, timeMs);
    });
}
export class HueSyncBox {
    constructor(options) {
        _host.set(this, void 0);
        _instanceName.set(this, void 0);
        _appName.set(this, void 0);
        _url.set(this, void 0);
        _bearerPath.set(this, void 0);
        _bearer.set(this, void 0);
        __classPrivateFieldSet(this, _host, options.host);
        __classPrivateFieldSet(this, _instanceName, options.instanceName || DEFAULT_INSTANCE_NAME);
        __classPrivateFieldSet(this, _appName, options.appName || DEFAULT_APP_NAME);
        __classPrivateFieldSet(this, _bearerPath, options.bearer || Path.join(os.homedir(), 'hue-sync-bearer'));
        __classPrivateFieldSet(this, _url, `https://${options.host}`);
    }
    fetchAPI(apiPath, _options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!__classPrivateFieldGet(this, _bearer)) {
                throw new Error('Bearer is undefined');
            }
            const options = Object.assign(Object.assign({}, _options), { headers: {
                    authorization: `Bearer ${__classPrivateFieldGet(this, _bearer)}`,
                }, agent: httpsAgent });
            if (options.json) {
                options.body = JSON.stringify(options.json);
                options.method = 'put';
                // @ts-ignore
                options.headers['content-type'] = 'application/json';
            }
            const url = __classPrivateFieldGet(this, _url) + apiPath;
            const response = yield fetch(url, options);
            if (response.status !== 200) {
                throw new Error('Invalid status=' + response.status);
            }
            const headers = response.headers;
            const contentType = headers.get('content-type');
            if (!contentType) {
                return null;
            }
            if (!contentType.indexOf('text/')) {
                const text = yield response.text();
                return text;
            }
            if (!contentType.indexOf('application/json')) {
                const json = yield response.json();
                return json;
            }
            const buffer = yield response.buffer();
            return buffer;
        });
    }
    getInfos() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield fetch(__classPrivateFieldGet(this, _url) + '/api/v1/registrations', { agent: httpsAgent });
            const json = yield result.json();
            return json;
        });
    }
    loadBearer(path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!path) {
                path = __classPrivateFieldGet(this, _bearerPath);
            }
            const content = yield fs.promises.readFile(path, { encoding: 'utf8' });
            __classPrivateFieldSet(this, _bearer, content);
            return content;
        });
    }
    writeBearer(path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!__classPrivateFieldGet(this, _bearer)) {
                throw new Error('Bearer is not defined');
            }
            if (!path) {
                path = __classPrivateFieldGet(this, _bearerPath);
            }
            const content = yield fs.promises.writeFile(path, __classPrivateFieldGet(this, _bearer), { encoding: 'utf8' });
            return content;
        });
    }
    getAuthorizationToken() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield fetch(__classPrivateFieldGet(this, _url) + '/api/v1/registrations', {
                method: 'POST',
                agent: httpsAgent,
                headers: {
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ appName: __classPrivateFieldGet(this, _appName), instanceName: __classPrivateFieldGet(this, _instanceName) }),
            });
            const json = yield result.json();
            debug('getAuthorizationToken', 'Json=', json);
            console.log('**** YOU HAVE 3mn to click on the HUE SYNC BOX\'s button');
            yield asyncTimeout(1000 * 10);
            const result2 = yield fetch(__classPrivateFieldGet(this, _url), {
                method: 'POST',
                agent: httpsAgent,
                headers: {
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ appName: __classPrivateFieldGet(this, _appName), instanceName: __classPrivateFieldGet(this, _instanceName) }),
            });
            const json2 = yield result2.json();
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
            __classPrivateFieldSet(this, _bearer, bearer);
            return bearer;
        });
    }
    getState() {
        return __awaiter(this, void 0, void 0, function* () {
            const json = yield this.fetchAPI('/api/v1');
            return json;
        });
    }
    getDeviceState() {
        return __awaiter(this, void 0, void 0, function* () {
            const json = yield this.fetchAPI(`/api/v1/device`);
            return json;
        });
    }
    getExecutionState() {
        return __awaiter(this, void 0, void 0, function* () {
            const json = yield this.fetchAPI(`/api/v1/execution`);
            return json;
        });
    }
    createExecutionRequests() {
        const requestState = {};
        const fetchAPI = this.fetchAPI.bind(this);
        return {
            mode(syncMode) {
                requestState.mode = syncMode;
                return this;
            },
            syncActive(enabled) {
                requestState.syncActive = enabled;
                return this;
            },
            hdmiActive(enabled) {
                requestState.hdmiActive = enabled;
                return this;
            },
            hdmiSource(source) {
                requestState.hdmiSource = source;
                return this;
            },
            brightness(brightness) {
                if (brightness < 0 || brightness > 200) {
                    throw new Error('Invalid brightness parameter');
                }
                requestState.brightness = brightness;
                return this;
            },
            incrementBrightness(incrementBrightness) {
                if (incrementBrightness < -200 || incrementBrightness > 200) {
                    throw new Error('Invalid incrementBrightness parameter');
                }
                requestState.incrementBrightness = incrementBrightness;
                return this;
            },
            intensity(intensity) {
                requestState.intensity = intensity;
                return this;
            },
            cycleIntensity(cycleIntensity) {
                requestState.cycleIntensity = cycleIntensity;
                return this;
            },
            run() {
                return __awaiter(this, void 0, void 0, function* () {
                    yield fetchAPI('/api/v1/execution', {
                        json: requestState,
                    });
                    return true;
                });
            },
        };
    }
}
_host = new WeakMap(), _instanceName = new WeakMap(), _appName = new WeakMap(), _url = new WeakMap(), _bearerPath = new WeakMap(), _bearer = new WeakMap();
if (false) {
    const t = new HueSyncBox({ host: '192.168.3.74' });
    t.getInfos().then((result) => {
        console.log(result);
        t.getAuthorizationToken().then((token) => __awaiter(void 0, void 0, void 0, function* () {
            console.log('Token=', token);
            yield t.writeBearer();
        }), (error) => {
            console.error('Get error', error);
        });
    });
    t.loadBearer().then(() => __awaiter(void 0, void 0, void 0, function* () {
        const executionState = yield t.getExecutionState();
        console.log('executionState', executionState);
        const ret = yield t.createExecutionRequests().mode('powersave').run();
        console.log('ret=', ret);
    }));
}
