// This is run in a defer tag so the page is loaded when this runs

const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

let isEdge = navigator.userAgentData.brands.some(b => b.brand == 'Microsoft Edge');
let browserName = isEdge ? 'Edge' : 'Chrome';
let browserVendor = isEdge ? 'Microsoft' : 'Google';

let g_MyDeviceId = '';
let g_PreviousDeviceName = '';
let g_IsFirstUIOpen = false;

$$('.browser-name').forEach(element => element.textContent = browserName);
$$('.browser-vendor').forEach(element => element.textContent = browserVendor);

chrome.storage.local.get(['deviceID', 'welcomed'], (result) => {
	let {deviceID} = result;
	g_MyDeviceId = deviceID;
	
	if (!result.welcomed) {
		// First time the user has seen the options UI
		chrome.storage.local.set({welcomed: true});
		$('#welcome-message').style.display = 'block';
		$('#login-notice').style.display = 'none';
		g_IsFirstUIOpen = true;
	}
	
	let deviceNameKey = `device_${deviceID}_name`;
	chrome.storage.sync.get([deviceNameKey], (result) => {
		let {[deviceNameKey]: deviceName} = result;
		g_PreviousDeviceName = deviceName;
		$('#this-device-name').value = deviceName;
		drawDeviceList();
	});
});

chrome.storage.onChanged.addListener((changes, namespace) => {
	if (namespace == 'sync' && Object.keys(changes).some(key => key.startsWith('device_'))) {
		// Device list changed. Update our UI.
		drawDeviceList();
	}
});

$('#this-device-name').addEventListener('change', function() {
	if (this.value == '') {
		this.value = g_PreviousDeviceName;
	}
	
	if (this.value == g_PreviousDeviceName) {
		return; // no change
	}
	
	chrome.storage.sync.set({[`device_${g_MyDeviceId}_name`]: this.value});
	g_PreviousDeviceName = this.value;
	
	// Flash the changes updated message
	let changesUpdatedMessage = $('#this-device-saved-notice');
	changesUpdatedMessage.style.animation = 'none';
	requestAnimationFrame(() => changesUpdatedMessage.style.animation = 'flash-text-green 10s linear 1');
});

function drawDeviceList() {
	chrome.storage.sync.get(null, (result) => {
		let deviceList = {};
		for (let i in result) {
			if (i.match(/^device_([0-9a-f]{16})_[a-z]+$/)) {
				let [_, deviceId, key] = i.split('_');
				deviceList[deviceId] = deviceList[deviceId] || {};
				deviceList[deviceId][key] = result[i];
			}
		}
		
		let devices = [];
		for (let i in deviceList) {
			if (i != g_MyDeviceId) {
				devices.push({id: i, ...deviceList[i]});
			}
		}
		
		devices.sort((a, b) => a.heartbeat > b.heartbeat ? -1 : 1);
		
		let container = $('#other-devices-list');
		container.innerHTML = '';
		
		if (devices.length == 0) {
			container.innerHTML = g_IsFirstUIOpen
				? `<i>No other devices registered yet.<br>Install Tab Sharer on your other ${browserName} browsers,<br>and make sure you're signed into your ${browserVendor} account.</i>`
				: `<i>No other devices registered.<br> Are you signed into ${browserName} with a ${browserVendor} account?</i>`;
			return;
		}
		
		let table = document.createElement('TABLE');
		table.className = 'device-list-table';
		
		let thead = document.createElement('THEAD');
		let tr = document.createElement('TR');
		tr.innerHTML = '<th class="device-name-col">Name</th><th>Last Seen Online</th><th></th>';
		thead.appendChild(tr);
		table.appendChild(thead);
		
		let tbody = document.createElement('TBODY');
		devices.forEach((device) => {
			tr = document.createElement('TR');
			
			// Name column
			let td = document.createElement('TD');
			td.textContent = device.name;
			tr.appendChild(td);
			
			// Last heartbeat column
			td = document.createElement('TD');
			td.textContent = (new Date(device.heartbeat)).toLocaleString();
			tr.appendChild(td);
			
			// Delete column
			td = document.createElement('TD');
			let deleteBtn = document.createElement('A');
			deleteBtn.href = '#';
			deleteBtn.innerHTML = `<img src="${chrome.runtime.getURL('/img/trash-16.png')}" alt="Delete" title="Delete" class="device-delete-btn">`;
			deleteBtn.addEventListener('click', function(evt) {
				evt.preventDefault();
				
				chrome.storage.sync.get(null, (result) => {
					let keys = Object.keys(result).filter(key => key.startsWith(`device_${device.id}`));
					chrome.storage.sync.remove(keys, () => {
						let confirmText = $('#device-deleted-confirm');
						confirmText.style.animation = 'none';
						requestAnimationFrame(() => confirmText.style.animation = 'flash-text-green 20s linear 1');
					});
				});
			});
			
			td.appendChild(deleteBtn);
			tr.appendChild(td);
			
			tbody.appendChild(tr);
		});
		
		table.appendChild(tbody);
		container.appendChild(table);
	});
}

function htmlspecialchars(str) {
	let div = document.createElement('DIV');
	div.textContent = str;
	return div.innerHTML;
}
