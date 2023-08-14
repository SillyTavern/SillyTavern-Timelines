
// TODO Docs for all the functions
// TODO Split out the functions into separate files
// TODO Add options for searching/filtering
// TODO Allow for toggling of movable nodes
// TODO Edge labels?
// TODO Possible minimap mode
// TODO More context menu options
// TODO Move away from CDNs
// TODO Experimental multi-tree view
// TODO Group support (maybe)
// TODO Mobile taps on iOS


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
loadFile('scripts/extensions/third-party/SillyTavern-Timelines/cytoscape.min.js', 'js');

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
import { characters, getRequestHeaders, openCharacterChat, saveSettingsDebounced } from "../../../../script.js";

let defaultSettings = {
	nodeWidth: 25,
	nodeHeight: 25,
	nodeSeparation: 50,
	edgeSeparation: 10,
	rankSeparation: 50,
	spacingFactor: 1,
	nodeShape: "ellipse",
	curveStyle: "taxi",
	bookmarkColor: "#ff0000",
};

// Keep track of where your extension is located
const extensionName = "SillyTavern-Timelines";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;
const extensionSettings = extension_settings[extensionName];

async function loadSettings() {
	// Ensure extension_settings.timeline exists
	if (!extension_settings.timeline) {
		console.log("Creating extension_settings.timeline");
		extension_settings.timeline = {};
	}

	// Only merge default settings if extension_settings.timeline is empty
	if (Object.keys(extension_settings.timeline).length === 0) {
		console.log("Merging default settings");
		Object.assign(extension_settings.timeline, defaultSettings);
	}

	// Update UI components
	$("#tl_node_width").val(extension_settings.timeline.nodeWidth).trigger("input");
	$("#tl_node_height").val(extension_settings.timeline.nodeHeight).trigger("input");
	$("#tl_node_separation").val(extension_settings.timeline.nodeSeparation).trigger("input");
	$("#tl_edge_separation").val(extension_settings.timeline.edgeSeparation).trigger("input");
	$("#tl_rank_separation").val(extension_settings.timeline.rankSeparation).trigger("input");
	$("#tl_spacing_factor").val(extension_settings.timeline.spacingFactor).trigger("input");
	$("#tl_node_shape").val(extension_settings.timeline.nodeShape).trigger("input");
	$("#tl_curve_style").val(extension_settings.timeline.curveStyle).trigger("input");
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
			name: "Start of Conversation",
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
	let bookmark = group.find(({ message }) => {
		// Check if the message is from the system and if it indicates a bookmark
		if (message.is_system && message.mes.includes("Bookmark created! Click here to open the bookmark chat")) return true;

		// Original bookmark case
		return !!message.extra && !!message.extra.bookmark_link;
	});

	let isBookmark = Boolean(bookmark);

	// Extract bookmarkName and fileNameForNode depending on bookmark type
	let bookmarkName, fileNameForNode;
	if (isBookmark) {
		if (bookmark.message.extra && bookmark.message.extra.bookmark_link) {
			bookmarkName = bookmark.message.extra.bookmark_link;
			fileNameForNode = bookmark.file_name;
		} else {
			// Extract file_name from the anchor tag in 'mes'
			let match = bookmark.message.mes.match(/file_name=\"(.*?)\"/);
			bookmarkName = match ? match[1] : null;
			fileNameForNode = bookmarkName;
		}
	} else {
		fileNameForNode = group[0].file_name;
	}


	let { is_name, is_user, name, send_date, is_system } = group[0].message;  // Added is_system here

	return {
		id: nodeId,
		msg: text,
		isBookmark: isBookmark,
		bookmarkName: bookmarkName,
		file_name: fileNameForNode,
		is_name: is_name,
		is_user: is_user,
		is_system: is_system,  // Added is_system to node properties
		name: name,
		send_date: send_date,
		messageIndex: group[0].index,
		color: isBookmark ? generateUniqueColor() : null,
		chat_sessions: group.map(({ file_name }) => file_name),
		chat_sessions_str: ';' + group.map(({ file_name }) => file_name).join(';') + ';',
	};
}


// Group messages by their content
function groupMessagesByContent(messages) {
	let groups = {};
	messages.forEach((messageObj, index) => {
		let { file_name, message } = messageObj;
		//System agnostic check for newlines
		try {
			message.mes = message.mes.replace(/\r\n/g, '\n');
			if (!groups[message.mes]) {
				groups[message.mes] = [];
			}
			groups[message.mes].push({ file_name, index, message });
		} catch (e) {
			console.log(`Message Grouping Error: ${e}: ${JSON.stringify(message, null, 4)}`);
		}
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

let activeTippies = new Set();

function makeTippy(ele, text) {
	var ref = ele.popperRef();
	var dummyDomEle = document.createElement('div');

	var tip = tippy(dummyDomEle, {
		getReferenceClientRect: ref.getBoundingClientRect,
		trigger: 'mouseenter',
		delay: [1000, 1000], // 0ms delay for both show and hide
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

	//remove extension from file name
	chatSessionName = chatSessionName.replace('.jsonl', '');
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
			incomingEdge.data.bookmarkName = bookmarkNode.data.bookmarkName;
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
	document.querySelector('.timeline-view-settings_block').appendChild(modal);
	modal.style.display = "none";
}

function createLegend(cy) {
	const legendContainer = document.getElementById('legendDiv');
	// Clear existing legends
	legendContainer.innerHTML = '';

	// Nodes Legend
	let nodeNames = new Set(); // Use a set to avoid duplicate names

	cy.nodes().forEach(node => {
		let name = node.data('name');
		let color = node.style('background-color'); // Fetching the node color

		// If the name is defined and is not yet in the set
		if (name && !nodeNames.has(name)) {
			nodeNames.add(name);
			createLegendItem(cy, legendContainer, { color, text: name, class: name.replace(/\s+/g, '-').toLowerCase() }, 'circle');
		}
	});

	// Edges Legend
	let edgeColors = new Map(); // Use a map to avoid duplicate colors and store associated names

	cy.edges().forEach(edge => {
		let color = edge.data('color');
		let bookmarkName = edge.data('bookmarkName');

		// If the color is defined and is not yet in the map
		if (color && !edgeColors.has(color)) {
			edgeColors.set(color, bookmarkName); // Set the color as key and bookmarkName as its value
			createLegendItem(cy, legendContainer, { color, text: bookmarkName || `Path of ${color}`, colorKey: color }, 'line');
		}
	});
}


// Variable to keep track of the currently highlighted elements
let currentlyHighlighted = null;

function createLegendItem(cy, container, item, type) {
	const legendItem = document.createElement('div');
	legendItem.className = 'legend-item';

	const legendSymbol = document.createElement('div');
	legendSymbol.className = 'legend-symbol';

	const selector = type === 'circle' ? `node[name="${item.text}"]` : `edge[color="${item.colorKey}"]`;

	// Mouseover for a preview
	legendItem.addEventListener('mouseover', function () {
		if (currentlyHighlighted !== selector) { // Only preview if the item isn't already clicked
			highlightElements(cy, selector);
		}
	});

	// Mouseout to remove the preview, but keep it if clicked (locked)
	legendItem.addEventListener('mouseout', function () {
		if (currentlyHighlighted !== selector) { // Only remove the preview if the item isn't clicked
			restoreElements(cy);
		}
	});

	// Click to lock/unlock the view
	legendItem.addEventListener('click', function () {
		if (currentlyHighlighted === selector) {
			restoreElements(cy);
			legendItem.classList.remove('active-legend');
			currentlyHighlighted = null;
		} else {
			if (currentlyHighlighted) {
				restoreElements(cy);
				const activeItems = document.querySelectorAll('.active-legend');
				activeItems.forEach(item => item.classList.remove('active-legend'));
			}
			highlightElements(cy, selector);
			legendItem.classList.add('active-legend');
			currentlyHighlighted = selector;
		}
	});

	if (type === 'circle') {
		legendSymbol.style.backgroundColor = item.color;
	} else if (type === 'line') {
		legendSymbol.style.borderTop = `3px solid ${item.color}`;
		legendSymbol.style.height = '5px';
		legendSymbol.style.width = '25px';
	}

	const legendText = document.createElement('div');
	legendText.className = 'legend-text';
	legendText.innerText = item.text;

	legendItem.appendChild(legendSymbol);
	legendItem.appendChild(legendText);

	container.appendChild(legendItem);
}



// Highlight elements based on selector
function highlightElements(cy, selector) {
	cy.elements().style({ 'opacity': 0.2 }); // Dim all nodes and edges

	// If it's an edge selector
	if (selector.startsWith('edge')) {
		let colorValue = selector.match(/color="([^"]+)"/)[1]; // Extract the color from the selector
		let nodeSelector = `node[borderColor="${colorValue}"]`; // Construct the node selector

		// Style the associated nodes
		cy.elements(nodeSelector).style({
			'opacity': 1,
			'underlay-color': 'white',
			'underlay-padding': '2px',
			'underlay-opacity': 0.5,
			'underlay-shape': 'ellipse'
		});
	}

	// For the initial selector (whether it's node or edge)
	cy.elements(selector).style({
		'opacity': 1,
		'underlay-color': 'white',
		'underlay-padding': selector.startsWith('edge') ? '2px' : '5px',
		'underlay-opacity': 0.5,
		'underlay-shape': selector.startsWith('edge') ? '' : 'ellipse', 

	});
}

// Restore elements function to restore all elements to their default opacity and remove underlays
function restoreElements(cy) {
	cy.elements().style({
		'opacity': 1,
		'underlay-color': '',
		'underlay-padding': '',
		'underlay-opacity': '',
		'underlay-shape': ''
	});
}

let layout = {}

let myDiagram = null;  // Moved the declaration outside of the function

function renderCytoscapeDiagram(nodeData) {
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
	console.log(extension_settings.timeline.curveStyle)
	const cytoscapeStyles = [
		{
			selector: 'edge',
			style: {
				'curve-style': extension_settings.timeline.curveStyle,
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
				'width': extension_settings.timeline.nodeWidth,
				'height': extension_settings.timeline.nodeHeight,
				'shape': extension_settings.timeline.nodeShape, // or 'circle'
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
		},
    	{
			selector: 'node[?is_system]',  // Select nodes with is_system property set to true
			style: {
				'background-color': 'grey',
				'border-style': 'dashed',
				'border-width': 3,
				'border-color': function (ele) {
					return ele.data('isBookmark') ? 'gold' : ele.data('borderColor') ? ele.data('borderColor') : "black";
				},
			}
		}
	];

	cytoscape.use(cytoscapeDagre);
	cytoscape.use(cytoscapeContextMenus);
	cytoscape.use(cytoscapePopper);

	const cy = cytoscape({
		container: myDiagramDiv,
		elements: nodeData,
		style: cytoscapeStyles,
		layout: layout,
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
			selector: `node[chat_sessions_str *= ";${session};"]`,
			onClickFunction: function (event) {
				var target = event.target || event.cyTarget;
				var depth = getNodeDepth(target);  
				navigateToMessage(session, depth);  
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
		selector: 'core',  
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
	});


	// cy.on('layoutstop', function () {
	// 	console.log('cy.on(layoutstop) called');
	// 	cy.maxZoom(2.5);
	// 	//cy.fit();
	// 	cy.maxZoom(100);
	// 	cy.resize();
	// });

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
	let showTimeout;

	const truncateMessage = (msg, length = 100) => {
		if (msg === undefined) {
			return '';
		}
		return msg.length > length ? msg.substr(0, length - 3) + '...' : msg;
	}

	//Figure out how to do the deley better later
	cy.on('mouseover', 'node', function (evt) {
		let node = evt.target;
		let truncatedMsg = truncateMessage(node.data('msg'));
		let content = `${node.data('name')}: ${truncatedMsg}`;

		// Delay the tooltip appearance by 3 seconds (3000 ms)
		showTimeout = setTimeout(() => {
			let tippy = makeTippy(node, content);
			tippy.show();
			node._tippy = tippy; // Store tippy instance on the node
		}, 150);
	});


	cy.on('mouseout', 'node', function (evt) {
		let node = evt.target;

		// Clear the timeout if mouse is moved out before tooltip appears
		if (showTimeout) {
			clearTimeout(showTimeout);
		}

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
	layout.rankDir = orientation;
	cy.layout(layout).run();

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
		document.querySelector('.timeline-view-settings_block').appendChild(modal);
		modal.style.display = "none";
	}

	window.onclick = function (event) {
		if (event.target == modal) {
			// Append the modal back to its original parent when clicked outside
			document.querySelector('.timeline-view-settings_block').appendChild(modal);
			modal.style.display = "none";
		}
	}

	// Append the modal to the body when showing it
	document.body.appendChild(modal);
	modal.style.display = "block";
}



let lastTimelineData = null; // Store the last fetched and prepared timeline data

async function updateTimelineDataIfNeeded() {
	const context = getContext();
	if (!lastContext || lastContext.characterId !== context.characterId) {
		// If the context has changed, fetch new data and prepare the timeline
		let data = await fetchData(context.characters[context.characterId].avatar);
		lastTimelineData = await prepareData(data);
		lastContext = context; // Update the lastContext to the current context
		console.log('Timeline data updated');
		layout = {
			name: 'dagre',
			nodeDimensionsIncludeLabels: true,
			nodeSep: extension_settings.timeline.nodeSeparation,
			edgeSep: extension_settings.timeline.edgeSeparation,
			rankSep: extension_settings.timeline.rankSeparation,
			rankDir: 'LR',  // Left to Right
			minLen: function (edge) { return 1; },
			spacingFactor: extension_settings.timeline.spacingFactor
		}
		return true; // Data was updated
	}
	return false; // No update occurred
}

// When the user clicks the button
async function onTimelineButtonClick() {
	const dataUpdated = await updateTimelineDataIfNeeded();
	handleModalDisplay();
	if (dataUpdated) {
		renderCytoscapeDiagram(lastTimelineData);
	}
}

jQuery(async () => {
	const settingsHtml = await $.get(`${extensionFolderPath}/timeline.html`);
	$("#extensions_settings").append(settingsHtml);
	$("#show_timeline_view").on("click", onTimelineButtonClick);

    // Bind listeners to the specific inputs
    const idsToSettingsMap = {
        'tl_node_width': 'nodeWidth',
        'tl_node_height': 'nodeHeight',
        'tl_node_separation': 'nodeSeparation',
        'tl_edge_separation': 'edgeSeparation',
        'tl_rank_separation': 'rankSeparation',
        'tl_spacing_factor': 'spacingFactor',
        'tl_node_shape': 'nodeShape',
        'tl_curve_style': 'curveStyle'
    };

    for (let [id, settingName] of Object.entries(idsToSettingsMap)) {
        $(`#${id}`).on('input', function() {
            onInputChange($(this), settingName);
        });
    }

	$(document).ready(function () {
		$("#toggleStyleSettings").click(function () {
			$("#styleSettingsArea").toggleClass("hidden");
		});
	});

	$("#resetSettingsBtn").click(function () {
		extension_settings.timeline = Object.assign({}, defaultSettings);
		loadSettings();
		saveSettingsDebounced();
	});


	loadSettings();
});

function onInputChange(element, settingName) {
	const value = element.val();
	extension_settings.timeline[settingName] = value;

	// Only update the label if the value is numeric
	if (!isNaN(value)) {
		$(`#${element.attr('id')}_value`).text(Math.round(value));
	}
	lastContext = null; // Invalidate the last context to force a data update
	saveSettingsDebounced();
}