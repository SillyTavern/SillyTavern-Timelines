// This script is going to use vis.js to create a network diagram
// The content of the network will be a messages of a conversation, with the root being the first message
// Branches will be at each bookmarked message
// The network should not be able to be edited, but should be able to be moved around


// I don't like this
function loadFile(src, type, callback) {
	var elem;

	if (type === "css") {
		elem = document.createElement("link");
		elem.rel = "stylesheet";
		elem.href = src;
	} else if (type === "js") {
		elem = document.createElement("script");
		elem.src = src;
		elem.onload = function () {
			if (callback) callback();
		};
	}

	if (elem) {
		document.head.appendChild(elem);
	}
}

// Load CSS file
loadFile("https://cdn.jsdelivr.net/npm/cytoscape-context-menus@4.1.0/cytoscape-context-menus.min.css", "css");
loadFile("https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/themes/light.min.css", "css");
loadFile("https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/themes/material.min.css", "css");
loadFile("https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/themes/light-border.min.css", "css");
loadFile("https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/themes/translucent.min.css", "css");


// Load JavaScript files
loadFile('scripts/extensions/third-party/st-tree-extension/cytoscape.min.js', 'js');

loadFile('https://cdn.jsdelivr.net/npm/elkjs@0.8.2/lib/elk.bundled.min.js', 'js', function () {
	loadFile('https://cdn.jsdelivr.net/npm/cytoscape-elk@2.2.0/dist/cytoscape-elk.min.js', 'js');
});

loadFile('https://cdn.jsdelivr.net/npm/dagrejs@0.2.1/dist/dagre.min.js', 'js', function () {
	loadFile('https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.min.js', 'js');
});


loadFile('https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/dist/tippy.umd.min.js', 'js', function () {
	loadFile('https://cdn.jsdelivr.net/npm/cytoscape-popper@2.0.0/cytoscape-popper.min.js', 'js');
});

loadFile('https://cdn.jsdelivr.net/npm/cytoscape-context-menus@4.1.0/cytoscape-context-menus.min.js', 'js');



import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { characters, getRequestHeaders, openCharacterChat } from "../../../../script.js";

let defaultSettings = {};

// Keep track of where your extension is located
const extensionName = "st-tree-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;
const extensionSettings = extension_settings[extensionName];

async function loadSettings() {
	//Create the settings if they don't exist
	extension_settings.tree_view = extension_settings.tree_view || {};
	if (Object.keys(extension_settings.tree_view).length === 0) {
		Object.assign(extension_settings.tree_view, defaultSettings);
	}

}

// Part 1: Preprocess chat sessions
function preprocessChatSessions(channelHistory) {
	let allChats = [];

	for (const [file_name, messages] of Object.entries(channelHistory)) {
		messages.forEach((message, index) => {
			if (!allChats[index]) {
				allChats[index] = [];
			}
			allChats[index].push({
				file_name,
				index,
				message
			});
		});
	}

	return allChats;
}

// Part 2: Process each message index and build nodes
function buildNodes(allChats) {
	let cyElements = [];
	let keyCounter = 1;
	let previousNodes = {};

	// Initialize root node
	cyElements.push({
		group: 'nodes',
		data: {
			id: "root",
			label: "Start of Conversation", // or any text you prefer
			x: 0,
			y: 0, 
		}
	});

	// Initialize previousNodes
	allChats[0].forEach(({ file_name }) => {
		previousNodes[file_name] = "root";
	});

	for (let messagesAtIndex = 0; messagesAtIndex < allChats.length; messagesAtIndex++) {
		let groups = groupMessagesByContent(allChats[messagesAtIndex]);

		for (const [text, group] of Object.entries(groups)) {
			let nodeId = `message${keyCounter}`;
			let parentNodeId = previousNodes[group[0].file_name];

			let node = createNode(nodeId, parentNodeId, text, group);
			cyElements.push({
				group: 'nodes',
				data: node
			});
			keyCounter += 1;

			// If you wish to create edges between nodes, you can add here
			cyElements.push({
				group: 'edges',
				data: {
					id: `edge${keyCounter}`,
					source: parentNodeId,
					target: nodeId
				}
			});

			updatePreviousNodes(previousNodes, nodeId, group);
		}
	}

	return cyElements;
}

// Create a node for Cytoscape
function createNode(nodeId, parentNodeId, text, group) {
	let bookmark = group.find(({ message }) => !!message.extra && !!message.extra.bookmark_link);
	let isBookmark = Boolean(bookmark);
	let bookmarkName = isBookmark ? bookmark.message.extra.bookmark_link : null;

	let { is_name, is_user, name, send_date } = group[0].message;  // Assuming these properties exist in every message

	return {
		id: nodeId,
		//parent: parentNodeId,
		msg: text,
		isBookmark: isBookmark,
		bookmarkName: bookmarkName,
		file_name: group[0].file_name,
		is_name: is_name,
		is_user: is_user,
		name: name,
		send_date: send_date,
		messageIndex: group[0].index, // assuming index exists in each group item
		color: isBookmark ? generateUniqueColor() : null, // assuming you have a function to generate unique colors
		chat_sessions: group.map(({ file_name }) => file_name), // add chat sessions to the node data
		chat_sessions_str: ';' + group.map(({ file_name }) => file_name).join(';') + ';',
	};

}

let activeTippies = new Set();

function makeTippy(ele, text) {
	var ref = ele.popperRef();
	var dummyDomEle = document.createElement('div');

	var tip = tippy(dummyDomEle, {
		getReferenceClientRect: ref.getBoundingClientRect,
		trigger: 'manual',
		delay: [0, 0], // 0ms delay for both show and hide
		duration: 0, // No animation duration
		content: function () {
			var div = document.createElement('div');
			div.innerHTML = text;
			return div;
		},
		arrow: true,
		placement: 'bottom',
		hideOnClick: true,
		sticky: "reference",
		interactive: true,
		appendTo: document.body
	});

	return tip;
};


// Group messages by their content
function groupMessagesByContent(messages) {
	let groups = {};
	messages.forEach((messageObj, index) => {
		let { file_name, message } = messageObj;
		if (!groups[message.mes]) {
			groups[message.mes] = [];
		}
		groups[message.mes].push({ file_name, index, message });
	});
	return groups;
}

// Update the last node for each chat in the group
function updatePreviousNodes(previousNodes, nodeKey, group) {
	group.forEach(({ file_name }) => {
		previousNodes[file_name] = nodeKey;
	});
}

// Part 3: Postprocess nodes
function postprocessNodes(nodeData) {
	// Placeholder for now; add additional steps if needed
	return nodeData;
}

// Final function that uses all parts
function convertToCytoscapeElements(channelHistory) {
	let allChats = preprocessChatSessions(channelHistory);
	let nodeData = buildNodes(allChats);
	nodeData = postprocessNodes(nodeData);
	return nodeData;
}


async function fetchData(characterAvatar) {
	const response = await fetch("/getallchatsofcharacter", {
		method: 'POST',
		body: JSON.stringify({ avatar_url: characterAvatar }),
		headers: getRequestHeaders(),
	});
	if (!response.ok) {
		return;
	}
	return response.json();
}

async function prepareData(data) {
	const context = getContext();
	let chat_dict = {};
	let chat_list = Object.values(data).sort((a, b) => a["file_name"].localeCompare(b["file_name"])).reverse();
	for (const { file_name } of chat_list) {
		try {
			const fileNameWithoutExtension = file_name.replace('.jsonl', '');
			const getChatResponse = await fetch('/getchat', {
				method: 'POST',
				headers: getRequestHeaders(),
				body: JSON.stringify({
					ch_name: characters[context.characterId].name,
					file_name: fileNameWithoutExtension,
					avatar_url: characters[context.characterId].avatar
				}),
				cache: 'no-cache',
			});
			if (!getChatResponse.ok) {
				continue;
			}
			const currentChat = await getChatResponse.json();
			// remove the first message, which is metadata
			currentChat.shift();
			chat_dict[file_name] = currentChat;
		} catch (error) {
			console.error(error);
		}
	}
	return convertToCytoscapeElements(chat_dict);
}

function generateUniqueColor() {
	const randomRGBValue = () => Math.floor(Math.random() * 256);
	return `rgb(${randomRGBValue()}, ${randomRGBValue()}, ${randomRGBValue()})`;
}

function closeOpenDrawers() {
	var openDrawers = $('.openDrawer').not('.pinnedOpen');

	openDrawers.addClass('resizing').slideToggle(200, "swing", function () {
		$(this).closest('.drawer-content').removeClass('resizing');
	});

	$('.openIcon').toggleClass('closedIcon openIcon');
	openDrawers.toggleClass('closedDrawer openDrawer');
}


async function navigateToMessage(chatSessionName, messageId) {
	console.log(chatSessionName, messageId);
	//remove extension from file name
	chatSessionName = chatSessionName.replace('.jsonl', '');
	console.log(chatSessionName, messageId);
	await openCharacterChat(chatSessionName);

	let message = $(`div[mesid=${messageId-1}]`); // Select the message div by the messageId
	let chat = $("#chat");

	if (message.length) {
		// calculate the position by adding the container's current scrollTop to the message's position().top
		let scrollPosition = chat.scrollTop() + message.position().top;
		chat.animate({ scrollTop: scrollPosition }, 500);  // scroll over half a second
	} else {
		console.log(`Message with id "${messageId}" not found.`);
	}
	closeOpenDrawers();
}

// Function to handle click events on nodes
function nodeClickHandler(node) {
	let depth = getNodeDepth(node);
	let chatSessions = node.data('chat_sessions');
	if (!(chatSessions && chatSessions.length > 1)) {
		let chatSessionName = node.data('file_name');
		navigateToMessage(chatSessionName, depth);
	}
}


// Function to get node depth
function getNodeDepth(node) {
	let depth = 0;
	while (node.incomers().nodes().length > 0) {
		node = node.incomers().nodes()[0];  // Assuming the node only has a single parent
		depth++;
	}
	return depth;
}

// Function to create a context menu adornment
function createContextMenuAdornment(goMake) {
	return goMake(go.Adornment, "Vertical",
		new go.Binding("itemArray", "chat_sessions"),
		{ itemTemplate: createContextMenuButton(goMake) }
	);
}

// Function to create a context menu button
function createContextMenuButton(goMake) {
	return goMake("ContextMenuButton",
		goMake(go.TextBlock, new go.Binding("text", "")),
		{ click: contextMenuButtonClickHandler }
	);
}

// Function to handle click events on context menu buttons
function contextMenuButtonClickHandler(e, button) {
	let chatSession = button.part.data;
	let node = e.diagram.findNodeForData(button.part.adornedPart.data);
	let depth = getNodeDepth(node);
	navigateToMessage(chatSession.file_name, depth);
}

// Function to create a shape
function createShape(goMake) {
	return goMake(go.Shape, "Circle",
		{ width: 25, height: 25 },
		new go.Binding("fill", "is_user", (is_user) => is_user ? "lightblue" : "white"),
		new go.Binding("stroke", "isBookmark", (isBookmark) => isBookmark ? "gold" : null),
		new go.Binding("strokeWidth", "isBookmark", (isBookmark) => isBookmark ? 3 : 0),
	);
}

// Function to create a tooltip adornment
function createTooltipAdornment(goMake) {
	return goMake(go.Adornment, "Auto",
		goMake(go.Shape, { fill: "#EFEFCC" }),
		goMake(go.TextBlock, { margin: 4 },
			new go.Binding("text", "", formatTooltipText)
		)
	);
}

// Function to format tooltip text
function formatTooltipText(d) {
	let text = `Text: ${d.text ? d.text : "N/A"}`;
	let fileName = d.file_name ? `\nFile Name: ${d.file_name}` : "";
	let sendDate = d.send_date ? `\nSend Date: ${d.send_date}` : "";
	let bookmarkName = d.bookmarkName ? `\nBookmark Name: ${d.bookmarkName}` : "";
	let index = d.messageIndex ? `\nIndex: ${d.messageIndex}` : "";
	return text + fileName + sendDate + bookmarkName + index;
}

// Function to highlight path to root
function highlightPathToRoot(rawData, bookmarkNodeId, currentHighlightThickness = 4, startingZIndex = 1000) {
	let bookmarkNode = Object.values(rawData).find(entry =>
		entry.group === 'nodes' && entry.data.id === bookmarkNodeId
	);

	if (!bookmarkNode) {
		console.error("Bookmark node not found!");
		return;
	}

	let currentNode = bookmarkNode;
	let currentZIndex = startingZIndex;
	while (currentNode) {
		// If the current node has the isBookmark attribute and it's not the initial bookmarkNode, stop highlighting
		if (currentNode !== bookmarkNode && currentNode.data.isBookmark) {
			break; // exit from the while loop
		}

		let incomingEdge = Object.values(rawData).find(entry =>
			entry.group === 'edges' && entry.data.target === currentNode.data.id
		);

		if (incomingEdge) {
			incomingEdge.data.isHighlight = true;
			incomingEdge.data.color = bookmarkNode.data.color;
			incomingEdge.data.bookmarkName = bookmarkNode.data.file_name;
			incomingEdge.data.highlightThickness = currentHighlightThickness;

			// Set the zIndex of the incomingEdge
			incomingEdge.data.zIndex = currentZIndex;
			currentNode.data.borderColor = incomingEdge.data.color;
			currentZIndex++; // Increase the zIndex for the next edge in the path

			currentHighlightThickness = Math.min(currentHighlightThickness + 0.1, 6);
			currentNode = Object.values(rawData).find(entry =>
				entry.group === 'nodes' && entry.data.id === incomingEdge.data.source
			);
		} else {
			currentNode = null;
		}
	}
}


// Function to close the modal
function closeModal() {
	let modal = document.getElementById("myModal");

	if (!modal) {
		console.error('Modal not found!');
		return;
	}

	// Append the modal back to its original parent when closed
	document.querySelector('.tree-view-settings_block').appendChild(modal);
	modal.style.display = "none";
}

function createLegend(cy) {
	// Nodes Legend
	const nodeLegendData = [
		{ color: "lightblue", text: "User" },
		{ color: "white", text: "Non-user" },
		{ color: "gold", text: "Bookmark" }
	];

	const legendContainer = document.getElementById('legendDiv');
	// Clear existing legends
	legendContainer.innerHTML = '';

	nodeLegendData.forEach(item => createLegendItem(legendContainer, item, 'circle'));

	// Edges Legend
	let edgeColors = new Map(); // Use a map to avoid duplicate colors and store associated names

	cy.edges().forEach(edge => {
		let color = edge.data('color');
		let bookmarkName = edge.data('bookmarkName');

		// If the color is defined and is not yet in the map
		if (color && !edgeColors.has(color)) {
			edgeColors.set(color, bookmarkName); // Set the color as key and bookmarkName as its value
			createLegendItem(legendContainer, { color, text: bookmarkName || `Path of ${color}` }, 'line');
		}
	});
}

function createLegendItem(container, item, type) {
	const legendItem = document.createElement('div');
	legendItem.className = 'legend-item';

	const legendSymbol = document.createElement('div');
	legendSymbol.className = 'legend-symbol';
	if (type === 'circle') {
		legendSymbol.style.backgroundColor = item.color;
	} else if (type === 'line') {
		legendSymbol.style.borderTop = `3px solid ${item.color}`;
		legendSymbol.style.height = '5px';  // Adjust as needed for line thickness
		legendSymbol.style.width = '25px'; // Set width for the line representation
	}

	const legendText = document.createElement('div');
	legendText.className = 'legend-text';
	legendText.innerText = item.text;

	legendItem.appendChild(legendSymbol);
	legendItem.appendChild(legendText);

	container.appendChild(legendItem);
}

let myDiagram = null;  // Moved the declaration outside of the function

function renderCytoscapeDiagram(nodeData) {
	console.log(nodeData);
	let myDiagramDiv = document.getElementById('myDiagramDiv');
	if (!myDiagramDiv) {
		console.error('Unable to find element with id "myDiagramDiv". Please ensure the element exists at the time of calling this function.');
		return;
	}

	// Highlight path for every bookmarked node
	Object.values(nodeData).forEach(entry => {
		if (entry.group === 'nodes' && entry.data.isBookmark) {
			highlightPathToRoot(nodeData, entry.data.id);
		}
	});
	
	const cytoscapeStyles = [
		{
			selector: 'edge',
			style: {
				'curve-style': 'taxi', // orthogonal routing
				'taxi-direction': 'rightward',
				'segment-distances': [5, 5], // corner radius
				'line-color': function (ele) {
					return ele.data('isHighlight') ? ele.data('color') : '#555';
				},
				'width': function (ele) {
					return ele.data('highlightThickness') ? ele.data('highlightThickness') : 3;
				},
				'z-index': function (ele) {
					return ele.data('zIndex') ? ele.data('zIndex') : 1;
				}
			}
		},
		{
			selector: 'node',
			style: {
				'width': 25,
				'height': 25,
				'shape': 'ellipse', // or 'circle'
				'background-color': function (ele) {
					return ele.data('is_user') ? 'lightblue' : 'white';
				},
				'border-color': function (ele) {
					return ele.data('isBookmark') ? 'gold' : ele.data('borderColor') ? ele.data('borderColor') : '#000';
				},
				'border-width': function (ele) {
					return ele.data('isBookmark') ? 4 : ele.data('borderColor') ? 3 : 0;
				}
			}
		}
	];

	// Create the diagram using elk layout
	cytoscape.use(cytoscapeDagre);
	cytoscape.use(cytoscapeContextMenus);
	cytoscape.use(cytoscapePopper);

	const cy = cytoscape({
		container: myDiagramDiv,
		elements: nodeData,
		style: cytoscapeStyles,
		layout: {
			name: 'dagre',
			nodeDimensionsIncludeLabels: true,
			rankDir: 'LR',
			// Add any other layout properties you'd like here.
		},
		wheelSensitivity: 0.2,  // Adjust as needed.

	});

	var allChatSessions = [];
	for (let i = 0; i < nodeData.length; i++) {
		if (nodeData[i].group === 'nodes' && nodeData[i].data.chat_sessions) {
			allChatSessions.push(...nodeData[i].data.chat_sessions);
		}
	}
	allChatSessions = [...new Set(allChatSessions)];

	// Initialize context menu with all chat sessions using the new selector format
	var menuItems = allChatSessions.map((session, index) => {
		return {
			id: 'chat-session-' + index,
			content: 'Open chat session ' + session,
			selector: `node[chat_sessions_str *= ";${session};"]`,  // Adjusted selector
			onClickFunction: function (event) {
				var target = event.target || event.cyTarget;
				var depth = getNodeDepth(target);  // your function to calculate node depth
				navigateToMessage(session, depth);  // your function to navigate to a message
				closeModal();
			},
			hasTrailingDivider: true
		};
	});

	menuItems.push({
		id: 'no-chat-session',
		content: 'No chat sessions available',
		selector: 'node[!chat_sessions_str]',  // Adjusted selector to match nodes without the chat_sessions_str attribute
		onClickFunction: function (event) {
			console.log('No chat sessions available');
		},
		hasTrailingDivider: true
	});

	menuItems.push({
		id: 'rotate-graph',
		content: 'Rotate Graph',
		selector: 'core',  // This is for documentation purposes, as this item applies to the core.
		coreAsWell: true,  // This makes sure the menu item is also available on right-clicking the graph background.
		onClickFunction: function (event) {
			toggleGraphOrientation(cy);  // This function toggles between the two orientations.
		},
		hasTrailingDivider: true
	});

	var contextMenu = cy.contextMenus({
		menuItems: menuItems,
		menuItemClasses: ['custom-menu-item'],
		contextMenuClasses: ['custom-context-menu'],
	});


	cy.ready(function () {
		createLegend(cy);
		cy.fit();
	});


	cy.on('layoutstop', function () {
		cy.maxZoom(2.5);
		cy.fit();
		cy.maxZoom(100);
		cy.resize();
	});

	cy.on('tap', 'node', function (event) {
		let node = event.target;
		nodeClickHandler(node);
		closeModal();
	});

	let hasSetOrientation = false;  // A flag to ensure we set the orientation only once

	cy.on('render', function () {
		if (!hasSetOrientation) {
			setGraphOrientationBasedOnViewport(cy);
			hasSetOrientation = true;
		}
	});
	cy.on('mouseover', 'node', function (evt) {
		let node = evt.target;
		//let content = JSON.stringify(node.data()); // customize as needed
		let content = `${node.data('name')}: ${node.data('msg')}`;
		let tippy = makeTippy(node, content);
		tippy.show();
		node._tippy = tippy; // Store tippy instance on the node
	});

	cy.on('mouseout', 'node', function (evt) {
		let node = evt.target;
		if (node._tippy) {
			node._tippy.hide();
		}
	});


}

function toggleGraphOrientation(cy) {
	currentOrientation = (currentOrientation === 'LR') ? 'TB' : 'LR';

	setOrientation(cy, currentOrientation);
}

let currentOrientation = 'TB'; // starting orientation

function setGraphOrientationBasedOnViewport(cy) {
	const viewportWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
	const viewportHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;

	const orientation = (viewportWidth > viewportHeight) ? 'LR' : 'TB';
	setOrientation(cy, orientation);
}

function setOrientation(cy, orientation) {
	// Update layout
	cy.layout({
		name: 'dagre',
		rankDir: orientation
	}).run();

	// Update taxi-direction in style
	const taxiDirection = orientation === 'TB' ? 'downward' : 'rightward';
	cy.style().selector('edge').style({
		'taxi-direction': taxiDirection
	}).update();
	currentOrientation = orientation;

}


let lastContext = null; // Initialize lastContext to null

// Handle modal display
function handleModalDisplay() {
	let modal = document.getElementById("myModal");

	// Ensure that modal exists
	if (!modal) {
		console.error('Modal not found!');
		return;
	}

	let closeBtn = modal.getElementsByClassName("close")[0];

	// Ensure that close button exists
	if (!closeBtn) {
		console.error('Close button not found!');
		return;
	}

	closeBtn.onclick = function () {
		// Append the modal back to its original parent when closed
		document.querySelector('.tree-view-settings_block').appendChild(modal);
		modal.style.display = "none";
	}

	window.onclick = function (event) {
		if (event.target == modal) {
			// Append the modal back to its original parent when clicked outside
			document.querySelector('.tree-view-settings_block').appendChild(modal);
			modal.style.display = "none";
		}
	}

	// Append the modal to the body when showing it
	document.body.appendChild(modal);
	modal.style.display = "block";
}



let lastTreeData = null; // Store the last fetched and prepared tree data

async function updateTreeDataIfNeeded() {
	const context = getContext();
	if (!lastContext || lastContext.characterId !== context.characterId) {
		// If the context has changed, fetch new data and prepare the tree
		let data = await fetchData(context.characters[context.characterId].avatar);
		lastTreeData = await prepareData(data);
		console.log(lastTreeData);
		lastContext = context; // Update the lastContext to the current context
	}
}

// When the user clicks the button
async function onTreeButtonClick() {
	await updateTreeDataIfNeeded();
	handleModalDisplay();
	renderCytoscapeDiagram(lastTreeData);
}


// This function is called when the extension is loaded
jQuery(async () => {
	// This is an example of loading HTML from a file
	const settingsHtml = await $.get(`${extensionFolderPath}/tree.html`);

	// Append settingsHtml to extensions_settings
	// extension_settings and extensions_settings2 are the left and right columns of the settings menu
	// You can append to either one
	$("#extensions_settings").append(settingsHtml);

	// A button to show the tree view
	$("#show_tree_view").on("click", onTreeButtonClick);
	// Load settings when starting things up (if you have any)
	loadSettings();
});
