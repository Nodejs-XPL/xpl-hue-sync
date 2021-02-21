/*jslint node: true, esversion: 6, sub: true, maxlen: 180 */

import Xpl from "xpl-api";
import commander from 'commander';
import Debug from 'debug';
import {HueSyncBox} from './dist/HueSync.js';
import Package from './package.json';
import * as async from "async";
import * as os from 'os';

const debug = Debug('xpl-hue-sync:cli');
const debugDevice = Debug('xpl-hue-sync:device');

commander.version(Package.version);
commander.option("--host <host>", "Hostname of hue sync");
commander.option("--bearer <path>", "Bearer path");

Xpl.fillCommander(commander);

commander.command('state').description("Start processing Hue-Sync").action(async () => {
	console.log("Start processing hue sync");

	const hueSync = new HueSyncBox(commander.opts());

	await hueSync.loadBearer()

	const state = await hueSync.getState();
	console.log('state=', state);
});

commander.command('run').action(async () => {

	const opts = commander.opts();

	const hueSyncBox = new HueSyncBox(opts);

	await hueSyncBox.loadBearer()

	const deviceAliases = Xpl.loadDeviceAliases(opts.deviceAliases);

	debug("Device aliases=", deviceAliases);

	if (!opts.xplSource) {
		let hostName = os.hostname();
		if (hostName.indexOf('.') > 0) {
			hostName = hostName.substring(0, hostName.indexOf('.'));
		}

		opts.xplSource = "hue-sync." + hostName;
	}

	const xpl = new Xpl(opts);

	xpl.on("error", (error) => {
		console.error("XPL error", error);
		process.exit(3);
	});

	xpl.bind((error) => {
		if (error) {
			console.error("Can not open xpl bridge ", error);
			process.exit(2);
			return;
		}

		console.log("Xpl bind succeed ");
		// xpl.sendXplTrig(body, callback);

		xpl.on("xpl:xpl-cmnd", processXplMessage.bind(xpl, hueSyncBox, deviceAliases));

		function e() {
			const now = Date.now();
			syncState(xpl, hueSyncBox, deviceAliases).then(() => {
				let n = Date.now();
				const t = Math.max(100, 1000 - (n - now));
				setTimeout(e, t);
			});
		}

		e();
	});
});

commander.parse(process.argv);

console.log('commander=', commander.opts());

let lastExecution = {}

async function syncState(xpl, hueSyncBox, deviceAliases) {
	let key = 'hue-sync';
	if (deviceAliases) {
		if (deviceAliases[key])
			key = deviceAliases[key];
		if (key === "ignore") {
			return;
		}
	}

	const sendXplStat = function (body) {
		console.log('sendXplStat', 'body=', body);
		return new Promise((resolve, reject) => {
			xpl.sendXplStat(body, "sensor.basic", (error) => {
				if (error) {
					console.error(error);
					reject(error);
					return;
				}
				resolve();
			});
		});
	}

	try {
		const state = await hueSyncBox.getState();
		const execution = state && state.execution;

		if (!execution) {
			return;
		}

		for (let k in execution) {
			//console.log('Scan=', k, execution[k]);
			if (typeof (execution[k]) === 'object') {
				continue;
			}

			if (lastExecution[k] !== execution[k]) {
				await sendXplStat({
					device: key,
					type: k,
					current: execution[k],
				})
			}
		}

		lastExecution = execution;

	} catch (x) {
		console.error(x);
	}
}

function processXplMessage(hueSyncBox, deviceAliases, message) {

	debug("processXplMessage", "Receive message", message);

	if (message.bodyName !== "delabarre.command" &&
		message.bodyName !== "x10.basic") {
		return;
	}

	const body = message.body;

	let command = body.command;
	let device = body.device;
	const current = body.current;

	switch (command) {
		// Xpl-delabarre
		case 'status':
			if (/(enable|enabled|on|1|true)/i.exec(body.current)) {
				command = "on";

			} else if (/(disable|disabled|off|0|false)/i.exec(body.current)) {
				command = "off";
			}
			break;

		// X10
		case 'all_units_off':
		case 'all_lights_off':
			command = "off";
			device = "all";
			break;

		case 'all_units_on':
		case 'all_lights_on':
			command = "on";
			device = "all";
			break;
	}

	if (device === 'mode' || device === 'all') {
		hueSyncBox.createExecutionRequests().mode((command === 'on') ? 'video' : 'passthrough').run().catch((error) => {
			console.error(error);
		})
	}
}
