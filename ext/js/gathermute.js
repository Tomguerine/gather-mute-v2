/// Uncomment this line to enable debugging in chrome
//debugger;

/// A "Simple" print function, using the Message system.
function print(message) {
	/// Uncomment this to enable printing.
	//chrome.runtime.sendMessage({log: message});
}

/// Gather mic buton has almost no identifiers, only a class that changes like this:
/// 	Active: class="css-15e33lp", 
/// 	Active-hover: class="css-434t8s",
/// 	Muted: class="css-oau38", 
/// 	Muted-hover: class="css-1o2pj3l"
/// This method searches for the mute button by class
const MUTE_BUTTON = 'button.css-15e33lp, button.css-oau38, button.css-1o2pj3l, button.css-434t8s, button.css-6lehkn'

var mBtn = null;
function getMuteButton() {
	/// isConnected is automatically updated if mBtn is no more connected to any DOM element
	if (mBtn != null && mBtn.isConnected)
		return mBtn;

	mBtn = null;

	var queryList = document.querySelectorAll(MUTE_BUTTON);
	/// 2 because mute and camera use the same classes. If we have only 1, we dont know which of them it is.
	if (queryList.length == 2)
		mBtn = queryList[0];

	if (!mBtn) {
		/// In some gather functions, like entering / exiting screen sharing the mute button is destroyed and rebuilt
		//print("[getMuteButton] Could not get mute button.\n" +
		//"Probably the layout of the page or button class has changed.\n" +
		//"We will now waitForMuteButton() again.");

		updateMuted(null);
		waitForMuteButton();
	}

	return mBtn;
}

/// Check actual mute state in Gather button.
/// This uses the class definitions Listed before.
/// If these values change, we will have to adjust them here.
function isMuted() {
	const muteButton = getMuteButton();
	if (!muteButton) return null;
	// Exemple en utilisant classList
	if (muteButton.classList.contains('css-6lehkn')) {
		return true;
	} else if (muteButton.classList.contains('css-8hbt4k')) {
		return false;
	}
	// Sinon, inspectez d'autres indicateurs (comme le style ou des attributs aria)
	return null;
}

/// Acctually updates internal state and mute button icon
var muted = null;
function updateMuted(newValue) {
	if (muted === newValue)
		return;

	muted = newValue;

	if (muted === null)
		chrome.runtime.sendMessage({ message: 'disconnected' });
	else if (muted === true)
		chrome.runtime.sendMessage({ message: 'muted' });
	else //if(muted === false)
		chrome.runtime.sendMessage({ message: 'unmuted' });
}

/// This Method awaits for the initial loading, until the actual Gather
/// Space is loaded so we can start searching for our mute button
const expectedBodyChildNodesCount = 7;
function watchBodyClass() {
	const bodyClassObserver = new MutationObserver((mutations) => {
		if (mutations[0].target.childNodes.length == expectedBodyChildNodesCount)
			waitForMuteButton();
	});

	bodyClassObserver.observe(document.querySelector('body'),
		{
			childList: true
		});
}
watchBodyClass();

const waitUntilElementExists = (MAX_TIME = 10000) => {
	let timeout = 0;

	const waitForContainerElement = (resolve, reject) => {
		var muteButton = getMuteButton();

		timeout += 200;

		if (timeout >= MAX_TIME) {
			print("[waitUntilElementExists] ERROR: Element not found. This is not expected.");
			reject('Element not found');
		}

		if (!muteButton || muteButton.length === 0)
			setTimeout(waitForContainerElement.bind(this, resolve, reject), 200);
		else
			resolve(muteButton);
	}

	return new Promise((resolve, reject) => {
		waitForContainerElement(resolve, reject);
	});
}

/// This is used by watchBodyClass to search for mute button when
/// Gather space id fully loaded.
var waitingForMuteButton = false;
function waitForMuteButton() {
	if (waitingForMuteButton)
		return;

	waitingForMuteButton = true;
	waitUntilElementExists().then((element) => {
		waitingForMuteButton = false;
		updateMuted(isMuted());
		watchIsMuted(element);
	})
		.catch((error) => {
			chrome.runtime.sendMessage({ message: 'disconnected' });
		});
}

/// This Method sets an observer in the actual mute button,
/// So we can reflect changes in our internal state (and mute button icon) in realtime. 
var isMutedObserver = null;
function watchIsMuted(element) {
	if (isMutedObserver)
		isMutedObserver.disconnect();

	isMutedObserver = new MutationObserver((mutations) => {
		updateMuted(isMuted());
	});

	isMutedObserver.observe(element,
		{
			attributes: true,
			attributeFilter: ['class'],
			attributeOldValue: true
		});
}

/// Attempt to return to "disconected" state.
/// TODO: This is not working properly yet =/
window.onbeforeunload = (event) => {
	try {
		chrome.runtime.sendMessage({ message: 'disconnected' });
	}
	catch (error) {
		print("[window.onbeforeunload] ERROR: " + error);
	}
}

/// Acctually change mute state in gather
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	muted = isMuted();

	if (!request || !request.command) {
		print("[chrome.runtime.onMessage.addListener] Invalid request");
		return;
	}

	//print("[chrome.runtime.onMessage.addListener] request.command === " + request.command);

	switch (request.command) {
		case 'toggle_mute':
			isPtt = false;
			muted = !muted;
			sendBtnClickCommand();
			break;
		case 'mute':
			isPtt = false;
			if (!muted) {
				muted = true;
				sendBtnClickCommand();
			}
			break;
		case 'unmute':
			isPtt = false;
			if (muted) {
				muted = false;
				sendBtnClickCommand();
			}
			break;
		case 'ptt':
			processPTT();
			break;
	}

	if (muted === null)
		sendResponse({ message: 'disconnected' });
	else if (muted === true)
		sendResponse({ message: 'muted' });
	else //if(muted === false)
		sendResponse({ message: 'unmuted' });
});

/// Push to talk methods
var isPtt = false;
var pttTimeoutHandle = null;
var pttDelayTimeInMs = 1000;
var pttResetTimerMs = 500;
var pttStartTime = 0;
function processPTT() {
	if (!isPtt) {
		isPtt = true;

		if (muted) {
			updateMuted(false);
			sendBtnClickCommand();
		}
	}

	/// Check time since last timer, for performance?
	if (Date.now() - pttStartTime < pttResetTimerMs)
		return;

	/// Always reset timer here
	pttStartTime = Date.now();
	clearTimeout(pttTimeoutHandle);
	pttTimeoutHandle = setTimeout(onPttExpired, pttDelayTimeInMs);
}

function onPttExpired() {
	if (!isPtt)
		return;

	isPtt = false;
	pttStartTime = 0;

	if (!muted) {
		updateMuted(true);
		sendBtnClickCommand();
	}
}

///////// Events to control gather button
/// KeyBoard Event - Ctrl+Shift+A 
/// This is the shortcut gather uses for muting, but for some reason, sending it has no effect
function sendKeyboardCommand() {
	document.dispatchEvent(new KeyboardEvent('keypress',
		{
			"key": "A",
			"code": "KeyA",
			"ctrlKey": true,
			"shiftKey": true,
			//"metaKey": true,
			"charCode": 97,
			"keyCode": 97,
			"which": 97,
			"isTrusted": true
		}));
}

/// Button click is still working =) ... for now.
function sendBtnClickCommand() {
	var muteButton = getMuteButton();
	if (muteButton)
		muteButton.click();
}

print("Gather Mute gathermute.js sucessfully loaded.");
