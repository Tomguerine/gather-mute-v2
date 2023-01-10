/// Uncomment this line to enable debugging in chrome
//debugger;

/// A "Simple" print function, using the Message system.
function print(message)
{
	chrome.runtime.sendMessage({log: message});
}

/// Gather mic buton has almost no identifiers, only a class that changes like this:
/// Active: class="css-15e33lp", 
/// Active-hover: class="css-434t8s",
/// Muted: class="css-oau38", 
/// Muted-hover: class="css-1o2pj3l"
/// This method searches for the mute button by class
const MUTE_BUTTON = 'button.css-15e33lp, button.css-oau38, button.css-1o2pj3l, button.css-434t8s'
var mBtn = null;
function getMuteButton()
{
	if(mBtn != null)
		return mBtn;
	
	var queryList = document.querySelectorAll(MUTE_BUTTON);
	if(queryList.length > 0)
		mBtn = queryList[0];
	if(!mBtn)
		print("[getMuteButton] Could not get mute button.\n" +
		"Maybe the layout of the page or button class has changed. Check this out.");
	
	return mBtn;
}

/// Check actual mute state in Gather button.
/// This uses the class definitions Listed before.
/// If these values change, we will have to adjust them here.
function isMuted() 
{
	var muteButton = getMuteButton();
	if(!muteButton)
		return true;
	
	/// Considering anyting but Active and Active-hover as muted.
	if(muteButton.className == 'css-15e33lp' || muteButton.className == 'css-434t8s')
		return false;
		
	return true;
}

/// Acctually updates internal state and mute button icon
var muted = null;
function updateMuted(newValue)
{
	if(muted === newValue)
		return;
	
	muted = newValue;
	chrome.runtime.sendMessage({ message: muted ? 'muted' : 'unmuted' });
}

/// This Method awaits for the initial loading, until the actual Gather
/// Space is loaded so we can start searching for our mute button
const expectedBodyChildNodesCount = 7;
function watchBodyClass() 
{
	const bodyClassObserver = new MutationObserver((mutations) =>
	{
		if(mutations[0].target.childNodes.length == expectedBodyChildNodesCount)
			waitForMuteButton();
	});
	
	bodyClassObserver.observe(document.querySelector('body'), 
	{
		childList: true
	});
}
watchBodyClass();

const waitUntilElementExists = (MAX_TIME = 5000) => 
{
	let timeout = 0;

	const waitForContainerElement = (resolve, reject) => 
	{
		var muteButton = getMuteButton();
		
		timeout += 100;
		
		print("[waitUntilElementExists] muteButton == " + muteButton);

		if (timeout >= MAX_TIME)
			reject('Element not found');

		if (!muteButton || muteButton.length === 0) 
			setTimeout(waitForContainerElement.bind(this, resolve, reject), 100);
		else 
			resolve(muteButton);
	}

	return new Promise((resolve, reject) => 
	{
		waitForContainerElement(resolve, reject);
	});
}

/// This is used by watchBodyClass to search for mute button when
/// Gather space id fully loaded.
var waitingForMuteButton = false;
function waitForMuteButton() 
{
	if (waitingForMuteButton) 
		return;

	waitingForMuteButton = true;
	waitUntilElementExists().then((el) => 
	{
		waitingForMuteButton = false;
		updateMuted(isMuted());
		watchIsMuted(el);
    })
    .catch((error) => 
	{
		chrome.runtime.sendMessage({ message: 'disconnected' });
    });
}

/// This Method sets an observer in the actual mute button,
/// So we can reflect changes in our internal state (and mute button icon) in realtime. 
var isMutedObserver;
function watchIsMuted(el) 
{
	if (isMutedObserver) 
		isMutedObserver.disconnect();

	isMutedObserver = new MutationObserver((mutations) => 
	{
		updateMuted(isMuted());
		
		//let newValue = mutations[0].target.getAttribute('data-is-muted') == 'true';
		/*let newValue = mutations[0].target.getAttribute('class') != 'css-15e33lp';*/

		//if (newValue != muted) 
		//	updateMuted(newValue);
	});
	
	isMutedObserver.observe(el, 
	{
		attributes: true,
		attributeFilter: ['class'],
		attributeOldValue: true
	});
}

/// Attempt to return to "disconected" state.
/// TODO: This is not working properly yey =/
window.onbeforeunload = (event) => 
{
	chrome.runtime.sendMessage({ message: 'disconnected' });
}

/// Acctually change Mute state in gather
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => 
{
    muted = isMuted();
	
	if(!request || !request.command)
	{
		print("[chrome.runtime.onMessage.addListener] Invalid request");
		return;
	}
	
	print("[chrome.runtime.onMessage.addListener] request.command === " + request.command);
	
	switch(request.command)
	{
		case 'toggle_mute':
			isPtt = false;
			muted = !muted;
			sendBtnClickCommand();
		break;
		case 'mute':
			isPtt = false;
			if (!muted) 
			{
				muted = true;
				sendBtnClickCommand();
			}
		break;
		case 'unmute':
			isPtt = false;
			if (muted) 
			{
				muted = false;
				sendBtnClickCommand();
			}
		break;
		case 'ptt':
			processPTT();
		break;
	}
	
    sendResponse({ message: muted ? 'muted' : 'unmuted' });
});

/// Push to talk methods
var isPtt = false;
var pttTimeoutHandle = null;
var pttDelayTimeInMs = 1000;
var pttResetTimerMs  = 500;
var pttStartTime = 0;
function processPTT()
{
	if (!isPtt)
	{
		isPtt = true;
	
		if (muted) 
		{
			muted = false;
			sendBtnClickCommand();
		}
	}
	
	/// Check time since last timer, for performance?
	if(Date.now() - pttStartTime < pttResetTimerMs)
		return;
	
	/// Always reset timer here
	pttStartTime = Date.now();
	clearTimeout(pttTimeoutHandle);
	pttTimeoutHandle = setTimeout(onPttExpired, pttDelayTimeInMs);
}

function onPttExpired()
{
	if(!isPtt)
		return;
		
	isPtt = false;
	pttStartTime = 0;
	
	if (!muted) 
	{
		muted = true;
		sendBtnClickCommand();
	}
}

///////// Events to control gather button
/// KeyBoard Event - Ctrl+Shift+A 
/// This is the shortcut gather uses for muting, but for some reason, sending it has no effect
function sendKeyboardCommand() 
{
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
function sendBtnClickCommand()
{
	var muteButton = getMuteButton();
	if(muteButton)
		muteButton.click();
}

print("Gather Mute gathermute.js sucessfully loaded.");
