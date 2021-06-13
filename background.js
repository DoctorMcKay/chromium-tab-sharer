let DEBUG = false; // controls logging; use let instead of const so we can toggle it later in the background page inspector

let g_DeviceList = {};
let g_MyDeviceId = null;

// For some reason, the chrome type definitions think that chrome.contextMenus.create returns void. In fact it returns
// a menu item ID, which is used later to add submenu items.
// noinspection JSVoidFunctionReturnValueUsed
let g_RootContextMenuItemId = chrome.contextMenus.create({
	contexts: ['all'],
	documentUrlPatterns: ['http://*/*', 'https://*/*'],
	title: 'Send page to device'
});
let g_SubContextMenuIds = [];

chrome.storage.onChanged.addListener((changes, namespace) => {
	log('namespace changed: ' + namespace);
	log(changes);
	
	if (namespace == 'sync') {
		let keys = Object.keys(changes);
		if (keys.some(key => key.startsWith('device_'))) {
			log('Device list changed');
			updateDeviceListContextMenu();
		}
		
		// Find tabs that were shared to us
		let sharedTabsKeys = keys.filter(key => key.startsWith(`sharedtab_${g_MyDeviceId}_`) && changes[key].newValue);
		sharedTabsKeys.forEach((key) => {
			chrome.tabs.create({
				active: false,
				url: changes[key].newValue.url
			});
		});
		
		if (sharedTabsKeys.length > 0) {
			chrome.storage.sync.remove(sharedTabsKeys);
		}
	}
});

// See if we have an ID for this device yet
chrome.storage.local.get(['deviceID'], (result) => {
	if (result.deviceID) {
		log(`Our pre-existing device ID is ${result.deviceID}`);
		g_MyDeviceId = result.deviceID;
	} else {
		// Generate a device ID
		g_MyDeviceId = '';
		let chars = '0123456789abcdef';
		for (let i = 0; i < 16; i++) {
			g_MyDeviceId += chars[Math.floor(Math.random() * chars.length)];
		}
		
		log(`Generated new device ID ${g_MyDeviceId}`);
		chrome.storage.local.set({deviceID: g_MyDeviceId}, function() {
			// First run? Open options page so the user can set the device name.
			chrome.runtime.openOptionsPage();
		});
	}
	
	heartbeat();
	setInterval(heartbeat, 1000 * 60 * 60); // heartbeat every hour
});

function heartbeat() {
	let nameKey = `device_${g_MyDeviceId}_name`;
	chrome.storage.sync.get([nameKey], (result) => {
		if (!result[nameKey]) {
			chrome.storage.sync.set({[nameKey]: 'New Device ' + (new Date()).toLocaleString()});
		}
	});
	
	let heartbeatKey = `device_${g_MyDeviceId}_heartbeat`;
	chrome.storage.sync.set({[heartbeatKey]: Date.now()});
}

function updateDeviceListContextMenu() {
	chrome.storage.sync.get(null, (result) => {
		g_DeviceList = {};
		for (let i in result) {
			if (i.match(/^device_([0-9a-f]{16})_[a-z]+$/)) {
				let [_, deviceId, key] = i.split('_');
				g_DeviceList[deviceId] = g_DeviceList[deviceId] || {};
				g_DeviceList[deviceId][key] = result[i];
			}
		}
		
		log('Got devices:');
		log(g_DeviceList);
		g_SubContextMenuIds.forEach(id => chrome.contextMenus.remove(id));
		g_SubContextMenuIds = [];
		
		let devices = [];
		for (let i in g_DeviceList) {
			devices.push({id: i, ...g_DeviceList[i]});
		}
		
		if (!DEBUG) {
			// Remove this device from the share menu
			devices = devices.filter(device => device.id != g_MyDeviceId);
		}
		
		devices.sort((a, b) => a.name < b.name ? -1 : 1);
		devices.forEach((device) => {
			// noinspection JSVoidFunctionReturnValueUsed
			g_SubContextMenuIds.push(chrome.contextMenus.create({
				contexts: ['all'],
				parentId: g_RootContextMenuItemId,
				title: device.name,
				onclick(info, tab) {
					sendTab(device, info, tab);
				}
			}));
		});
		
		if (devices.length == 0) {
			// noinspection JSVoidFunctionReturnValueUsed
			g_SubContextMenuIds.push(chrome.contextMenus.create({
				contexts: ['all'],
				parentId: g_RootContextMenuItemId,
				title: 'No other devices registered',
				enabled: false
			}));
		}
		
		// noinspection JSVoidFunctionReturnValueUsed
		g_SubContextMenuIds.push(chrome.contextMenus.create({contexts: ['all'], parentId: g_RootContextMenuItemId, type: 'separator'}));
		// noinspection JSVoidFunctionReturnValueUsed
		g_SubContextMenuIds.push(chrome.contextMenus.create({
			contexts: ['all'],
			parentId: g_RootContextMenuItemId,
			title: 'Manage devices...',
			onclick(info, tab) {
				chrome.runtime.openOptionsPage();
			}
		}));
	});
}

function sendTab(device, info, tab) {
	let url = info.linkUrl || tab.url;
	log(`Sending tab "${url}" to ${device.id}`);
	chrome.storage.sync.set({[`sharedtab_${device.id}_${Date.now()}`]: {url}});
}

function log(msg) {
	if (DEBUG) {
		console.log(msg);
	}
}
