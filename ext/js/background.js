/// Uncomment this line to enable debugging in chrome
//debugger;

/// Simple print function using console.Log
function print(message)
{
	/// Uncomment this to enable printing.
	//console.log(message);
}

/// Listener to Chrome commands. Shortcuts come through here
chrome.commands.onCommand.addListener((command) => 
{
	handleCommand(command);
});

/// Listener to messages sent from gathermute.js
chrome.runtime.onMessage.addListener( (request, sender, sendResponse) => 
{
	if (request.hasOwnProperty('message'))
		setIcon(request.message);
	
	if (request.hasOwnProperty('log'))
		print("Print from content script:\n" + request.log)
});

/// Extension button clicks handler
chrome.action.onClicked.addListener((tab) => 
{
	handleCommand('toggle_mute');
});

/// Process commands if we have a gathertab opened
function handleCommand(command) 
{
	chrome.windows.getAll({ populate: true }, windowList => 
	{
		let gatherTabs = getGatherTabs(windowList);

		if (gatherTabs.length > 0)
			processCommand(command, gatherTabs);
	});
}

function getGatherTabs(windowList) 
{
	let gatherTabs = [];
	windowList.forEach(w => 
	{
		w.tabs.forEach(tab => 
		{
			if (tab && tab.url && tab.url.startsWith('https://app.gather.town/')) 
				gatherTabs.push(tab);
		});
	});
	return gatherTabs;
}

function processCommand(command, gatherTabs) 
{
	gatherTabs.forEach((tab) => 
	{
		chrome.tabs.sendMessage(tab.id, { command: command }, (response) => 
		{
			print("[background][processCommand] command" + command);
			setIcon(response.message);
		});
	});
}

/// Change Icon based on status
var buttonState = '';
function setIcon(status) 
{
	///Optimization bail out
	if(buttonState == status)
		return;
	
	buttonState = status;
	
	let iconType = '';
	if (status === 'muted' || status === 'unmuted') 
		iconType = '_' + status;

	let title = status.charAt(0).toUpperCase() + status.substr(1);
	chrome.action.setIcon(
	{
		path: 
		{
			/// This path is relative to the script path
			"32": "../icons/icon32" + iconType + ".png",
			"48": "../icons/icon48" + iconType + ".png",
			"128":"../icons/icon128"+ iconType + ".png"
		}
	});
	
	chrome.action.setTitle(
	{
		title: title
	});
}

print("Gather Mute background.js sucessfully loaded.");
