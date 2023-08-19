
// TODO Edge labels?
// TODO Possible minimap mode
// TODO More context menu options
// TODO Experimental multi-tree view
// TODO Mobile taps on iOS


/**
 * Loads an external file (CSS or JS) into the document's head.
 * 
 * @param {string} src - The source URL or path to the file to load.
 * @param {string} type - The type of file to load. Accepted values are "css" or "js".
 * @param {Function} [callback] - Optional callback function to execute once the file is loaded (used only for JS files).
 */
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

// Keep track of where your extension is located
const extensionName = "SillyTavern-Timelines";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

// Load CSS file
loadFile(`${extensionFolderPath}cytoscape-context-menus.min.css`, "css");
loadFile(`${extensionFolderPath}light.min.css`, "css");
loadFile(`${extensionFolderPath}material.min.css`, "css");
loadFile(`${extensionFolderPath}light-border.min.css`, "css");
loadFile(`${extensionFolderPath}translucent.min.css`, "css");
loadFile(`${extensionFolderPath}tippy.css`, "css");
loadFile(`${extensionFolderPath}tl_style.css`, "css");

// Load JavaScript files
loadFile(`scripts/extensions/third-party/SillyTavern-Timelines/cytoscape.min.js`, 'js');
loadFile(`${extensionFolderPath}dagre.min.js`, 'js', function () {
	loadFile(`${extensionFolderPath}cytoscape-dagre.min.js`, 'js');
});
loadFile(`${extensionFolderPath}tippy.umd.min.js`, 'js', function () {
	loadFile(`${extensionFolderPath}cytoscape-popper.min.js`, 'js');
});
loadFile(`${extensionFolderPath}cytoscape-context-menus.min.js`, 'js');

import { extension_settings, getContext, } from "../../../extensions.js";
import { characters, getRequestHeaders, saveSettingsDebounced, } from "../../../../script.js";

import { navigateToMessage, closeModal, handleModalDisplay, closeOpenDrawers } from './tl_utils.js';
import { setupStylesAndData, highlightElements, restoreElements } from './tl_style.js';
import { fetchData, prepareData } from './tl_node_data.js';
import { toggleGraphOrientation, highlightNodesByQuery, getNodeDepth, setGraphOrientationBasedOnViewport } from './tl_graph.js';
import { registerSlashCommand } from "../../../slash-commands.js";
import { fixMarkdown } from "../../../power-user.js";

let defaultSettings = {
	nodeWidth: 25,
	nodeHeight: 25,
	nodeSeparation: 50,
	edgeSeparation: 10,
	rankSeparation: 50,
	spacingFactor: 1,
	nodeShape: "ellipse",
	curveStyle: "taxi",
	avatarAsRoot: true,
	bookmarkColor: "#ff0000",
	useChatColors: false,
	charNodeColor: "#FFFFFF",
	userNodeColor: "#ADD8E6",
	edgeColor: "#555",
	lockNodes: true,
};

// Variable to keep track of the currently highlighted elements
let currentlyHighlighted = null;
let lastContext = null; // Initialize lastContext to null
let layout = {};
let lastTimelineData = null; // Store the last fetched and prepared timeline data
let activeTippies = new Set();

/**
 * Asynchronously loads settings from `extension_settings.timeline`, 
 * filling in with default settings if some are missing.
 * 
 * After loading the settings, it also updates the UI components 
 * with the appropriate values from the loaded settings.
 */
async function loadSettings() {
	// Ensure extension_settings.timeline exists
	if (!extension_settings.timeline) {
		console.log("Creating extension_settings.timeline");
		extension_settings.timeline = {};
	}

	// Check and merge each default setting if it doesn't exist
	for (const [key, value] of Object.entries(defaultSettings)) {
		if (!extension_settings.timeline.hasOwnProperty(key)) {
			console.log(`Setting default for: ${key}`);
			extension_settings.timeline[key] = value;
		}
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
	$("#tl_avatar_as_root").prop("checked", extension_settings.timeline.avatarAsRoot).trigger("input");
	$("#tl_use_chat_colors").prop("checked", extension_settings.timeline.useChatColors).trigger("input");
	$("#tl_lock_nodes").prop("checked", extension_settings.timeline.lockNodes).trigger("input");
	$("#bookmark-color-picker").attr('color', extension_settings.timeline.bookmarkColor);
	$("#edge-color-picker").attr('color', extension_settings.timeline.edgeColor);
	$("#user-node-color-picker").attr('color', extension_settings.timeline.userNodeColor);
	$("#char-node-color-picker").attr('color', extension_settings.timeline.charNodeColor);

}

let isTapTippyActive = false;

/**
 * Creates a Tippy tooltip for a given Cytoscape element with specified content.
 * 
 * @param {Object} ele - The Cytoscape element (node/edge) to attach the tooltip to.
 * @param {string} text - The content to be displayed inside the tooltip.
 * @returns {Object} - Returns the Tippy tooltip instance.
 */
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
		appendTo: document.body,
	});

	return tip;
};

function formatNodeMessage(mes) {
	if (mes == null) return "";
	mes = fixMarkdown(mes);
	mes = mes.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
	mes = mes.replace(/```[\s\S]*?```|``[\s\S]*?``|`[\s\S]*?`|(\".+?\")|(\u201C.+?\u201D)/gm, function (match, p1, p2) {
		if (p1) {
			return '<q>' + p1.replace(/\"/g, "") + '</q>';
		} else if (p2) {
			return '<q>“' + p2.replace(/\u201C|\u201D/g, "") + '”</q>';
		} else {
			return match;
		}
	});



	// 5. Handling mathematical notation
	mes = mes.replaceAll('\\begin{align*}', '$$').replaceAll('\\end{align*}', '$$');

	let converter = new showdown.Converter({
		emoji: "true",
		literalMidWordUnderscores: "true",
		parseImgDimensions: "true",
		tables: "true",
	});
	
	mes = converter.makeHtml(mes);

	// 7. Handle <code> tags
	mes = mes.replace(/<code(.*)>[\s\S]*?<\/code>/g, function (match) {
		return match.replace(/\n/gm, '\u0000');
	});
	mes = mes.replace(/\n/g, "<br/>");
	mes = mes.replace(/\u0000/g, "\n");
	mes = mes.trim();
	mes = mes.replace(/<code(.*)>[\s\S]*?<\/code>/g, function (match) {
		return match.replace(/&amp;/g, '&');
	});

	return mes;
}


function makeTapTippy(ele) {
	var ref = ele.popperRef();
	var dummyDomEle = document.createElement('div');

	var tip = tippy(dummyDomEle, {
		getReferenceClientRect: ref.getBoundingClientRect,
		trigger: 'manual',
		duration: 0,
		content: function () {
			var div = document.createElement('div');
			div.classList.add('tap_tippy_content');

			// Display specific node data with individual classes
			var dataItems = [
				{ content: ele.data('name'), className: 'name_text' },
				{ content: ele.data('send_date'), className: 'timestamp' },
			];

			dataItems.forEach(dataItem => {
				let p = document.createElement('div');
				p.classList.add(dataItem.className);
				p.innerHTML = dataItem.content;
				div.appendChild(p);
			});

			// Insert an <hr> between name, date, and the message content
			div.appendChild(document.createElement('hr'));

			// Add the message content
			let mesDiv = document.createElement('div');
			mesDiv.classList.add('mes_text');
			mesDiv.innerHTML = formatNodeMessage(ele.data('msg'));
			div.appendChild(mesDiv);

			// Insert an <hr> before adding the interactive menu based on chat_sessions
			div.appendChild(document.createElement('hr'));

			var menuDiv = document.createElement('div');
			menuDiv.classList.add('menu_div');
			if (ele.data('chat_sessions')) {
				ele.data('chat_sessions').forEach((session, index) => {
					let btn = document.createElement('button');
					btn.classList.add('menu_button');
					btn.textContent = session.split('.jsonl')[0];
					btn.dataset.sessionIndex = index; // Storing the session index as a data attribute
					btn.addEventListener('click', function () {
						var depth = getNodeDepth(ele);
						navigateToMessage(session, depth);
						closeModal();
						tip.hide(); // Hide the Tippy tooltip
					});
					menuDiv.appendChild(btn);
				});
			}
			div.appendChild(menuDiv);

			return div;
		},
		arrow: true,
		placement: 'auto',
		hideOnClick: false,
		sticky: "reference",
		interactive: true,
		appendTo: document.body,
		boundary: document.querySelector('#myDiagramDiv'),
		onShow() {
			isTapTippyActive = true;
		},
		onHide() {
			isTapTippyActive = false;
			console.log("Tap Tippy hidden");
		},
		popperOptions: {
			modifiers: [
				{
					name: 'preventOverflow',
					options: {
						boundary: document.querySelector('#myDiagramDiv')
					}
				},
				{
					name: 'flip',
					options: {
						boundary: document.querySelector('#myDiagramDiv')
					}
				},
            {
					name: 'computeStyles',
					options: {
						adaptive: true,
						gpuAcceleration: false, // turning this off can fix the arrow being off (sometimes)
						zIndex: 9999
					}
				}				
			]
		}
	});

	return tip;
};


/**
 * Handles click events on nodes in a Cytoscape graph.
 * 
 * This function performs the following tasks:
 * 1. Determines the depth of the clicked node.
 * 2. Fetches the associated chat sessions of the node.
 * 3. If the node is associated with a single chat session, it navigates 
 *    to the corresponding message within the chat session based on its depth.
 * 
 * @param {Object} node - The clicked node from the Cytoscape graph.
 */
function nodeClickHandler(node) {
	let depth = getNodeDepth(node);
	let chatSessions = node.data('chat_sessions');

	if (chatSessions && chatSessions.length > 1) {
		let modalTextElement = document.getElementById('nodeText');
		let chatSessionListElement = document.getElementById('chatSessionList');

		// Setting the full text from node data
		modalTextElement.textContent = node.data('full_text'); // Assuming 'full_text' is a property in your node data

		// Clear previous chat sessions
		chatSessionListElement.innerHTML = '';

		// Populate the list of chat sessions
		chatSessions.forEach(session => {
			let listItem = document.createElement('li');
			listItem.textContent = session.name; // Adjust based on your chat session structure
			listItem.addEventListener('click', function () {
				closeNodeModal();
				navigateToMessage(session.file_name, depth); // Assuming 'file_name' is a property in your chat session data
			});
			chatSessionListElement.appendChild(listItem);
		});

		showNodeModal();
	} else {
		let chatSessionName = node.data('file_name');
		closeNodeModal();
		navigateToMessage(chatSessionName, depth);
	}
}

function showNodeModal() {
	document.getElementById('nodeModal').style.display = 'block';
}

function closeNodeModal() {
	document.getElementById('nodeModal').style.display = 'none';
}

/**
 * Creates and populates a legend for nodes and edges in a Cytoscape graph.
 * 
 * This function works in the following steps:
 * 1. Clears any existing legends in the specified container.
 * 2. Iterates over all nodes in the graph:
 *    - If a node with a unique name is found, its details (name and color) 
 *      are added to the legend under the 'Nodes Legend' category.
 * 3. Iterates over all edges in the graph:
 *    - If an edge with a unique color is found, its details (bookmark name and color) 
 *      are added to the legend under the 'Edges Legend' category.
 * 
 * @param {Object} cy - The Cytoscape instance where graph operations are performed.
 */
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


/**
 * Creates and appends a legend item to the provided container based on the item's type and details.
 * 
 * This function performs the following tasks:
 * 1. Constructs the legend item and its corresponding visual symbol.
 * 2. Binds mouseover, mouseout, and click events to the legend item:
 *    - `mouseover`: Highlights corresponding elements on the Cytoscape graph to preview the legend item's representation.
 *    - `mouseout`: Restores graph elements to their original state after the preview unless the legend item is selected (locked).
 *    - `click`: Toggles the highlighting (locking/unlocking) of graph elements corresponding to the legend item.
 * 3. Sets visual styles for the legend symbol based on the item type.
 * 4. Appends the constructed legend item to the provided container.
 * 
 * @param {Object} cy - The Cytoscape instance where graph operations are performed.
 * @param {HTMLElement} container - The container element to which the legend item will be appended.
 * @param {Object} item - The legend item details with `text` and `color` or `colorKey` properties.
 * @param {string} type - The type of legend item; can be either 'circle' for nodes or 'line' for edges.
 */
function createLegendItem(cy, container, item, type) {
	const legendItem = document.createElement('div');
	legendItem.className = 'legend-item';

	const legendSymbol = document.createElement('div');
	legendSymbol.className = 'legend-symbol';

	const selector = type === 'circle' ? `node[name="${item.text}"]` : `edge[color="${item.colorKey}"]`;

	// Mouseover for a preview
	legendItem.addEventListener('mouseover', function () {
		if (!legendItem.classList.contains('active-legend') && currentlyHighlighted !== selector) {
			highlightElements(cy, selector);
		}
	});


	// Mouseout to remove the preview, but keep it if clicked (locked)
	legendItem.addEventListener('mouseout', function () {
		if (!legendItem.classList.contains('active-legend') && currentlyHighlighted !== selector) {
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
	legendText.innerText = item.text.split(' - ')[0];

	legendItem.appendChild(legendSymbol);
	legendItem.appendChild(legendText);

	container.appendChild(legendItem);
}


/**
 * Initializes a Cytoscape instance with given node data and styles.
 * 
 * This function does the following:
 * 1. Locates the container element 'myDiagramDiv' for the Cytoscape graph.
 * 2. Registers the necessary plugins: 'cytoscapeDagre', 'cytoscapeContextMenus', and 'cytoscapePopper'.
 * 3. Creates and configures the Cytoscape instance with the provided node data, styles, and layout settings.
 * 4. Adjusts wheel sensitivity for zooming operations on the graph.
 * 
 * @param {Array<Object>} nodeData - Array of node data objects containing information required to render nodes and edges.
 * @param {Array<Object>} styles - Array of style definitions for nodes, edges, and other graph elements.
 * @returns {Object|null} Returns the Cytoscape instance if initialization is successful, otherwise returns null.
 */
function initializeCytoscape(nodeData, styles) {
	let myDiagramDiv = document.getElementById('myDiagramDiv');
	if (!myDiagramDiv) {
		console.error('Unable to find element with id "myDiagramDiv". Please ensure the element exists at the time of calling this function.');
		return null;
	}

	cytoscape.use(cytoscapeDagre);
	cytoscape.use(cytoscapeContextMenus);
	cytoscape.use(cytoscapePopper);

	const cy = cytoscape({
		container: myDiagramDiv,
		elements: nodeData,
		style: styles,
		layout: layout,
		wheelSensitivity: 0.2,  // Adjust as needed.
	});

	return cy;
}

/**
 * Sets up event handlers for the given Cytoscape instance and node data.
 * 
 * This function does the following:
 * 1. Gathers all chat sessions from the node data.
 * 2. Initializes the context menu for the Cytoscape instance based on chat sessions, 
 *    providing options to open specific chat sessions or rotate the graph.
 * 3. Attaches listeners to the 'input' event of the search field to enable node highlighting based on search query.
 * 4. Adds an event listener to handle node clicks, triggering actions like node navigation.
 * 5. Configures the graph's orientation based on the viewport dimensions.
 * 6. Implements a delay for displaying tooltips on node hover, showcasing truncated node messages.
 * 
 * @param {Object} cy - The Cytoscape instance for which the event handlers are being set up.
 * @param {Array<Object>} nodeData - Array of node data objects containing information like chat sessions.
 */
function setupEventHandlers(cy, nodeData) {
	let showTimeout;
	let activeTapTippy = null;

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
				activeTapTippy.hide();
			},
			hasTrailingDivider: true
		};
	});

	document.getElementById('transparent-search').addEventListener('input', function (e) {
		let mainSearch = document.getElementById('transparent-search');
		mainSearch.value = e.target.value;

		let query = e.target.value.toLowerCase();
		highlightNodesByQuery(cy, query);
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
			toggleGraphOrientation(cy, layout);  // This function toggles between the two orientations.
		},
		hasTrailingDivider: true
	});
	try{
		var contextMenu = cy.contextMenus({
			menuItems: menuItems,
			menuItemClasses: ['custom-menu-item'],
			contextMenuClasses: ['custom-context-menu'],
		});
	}catch(e){
		console.log(e);
		console.log("contextMenu is likely not allowed on this device.");
	}

	cy.ready(function () {
		createLegend(cy);
		closeOpenDrawers();
	});

	cy.on('tap', 'node', function (evt) {
		clearTimeout(showTimeout); // Clear any pending timeout for showing tooltip
		let node = evt.target;
		if (node._tippy) {
			node._tippy.hide(); // Hide the tippy instance associated with the node
		}
		if (activeTapTippy) {
			activeTapTippy.hide();
		}
		let tipInstance = makeTapTippy(node);

		// Show the tooltip
		tipInstance.show();

		activeTapTippy = tipInstance;


		// Optional: Hide the tooltip if user taps anywhere else
		cy.on('tap', function (e) {
			if (e.target === cy) {
				tipInstance.hide();
			}
		});
	});

	// Handle double click on nodes for quickly navigating to the message
	cy.on('dbltap ', 'node', function (evt) {
		let node = evt.target;
		let session = node.data('chat_sessions')[0];
		let depth = getNodeDepth(node);
		navigateToMessage(session, depth);
		closeModal();
		activeTapTippy.hide();
	});


	let hasSetOrientation = false;  // A flag to ensure we set the orientation only once

	cy.on('render', function () {
		if (!hasSetOrientation) {
			setGraphOrientationBasedOnViewport(cy, layout);
			hasSetOrientation = true;
			if (extension_settings.timeline.lockNodes) {
				cy.nodes().forEach(node => {
					node.lock();
				});
			}
		}
	});

	const truncateMessage = (msg, length = 100) => {
		if (msg === undefined) {
			return '';
		}
		return msg.length > length ? msg.substr(0, length - 3) + '...' : msg;
	}

	//Figure out how to do the deley better later
	cy.on('mouseover', 'node', function (evt) {
		if (isTapTippyActive) {
			return;  // Return early if tap Tippy is active
		}

		let node = evt.target;
		let truncatedMsg = truncateMessage(node.data('msg'));
		let content = node.data('name') ? `${node.data('name')}: ${truncatedMsg}` : truncatedMsg;

		// Delay the tooltip appearance by 3 seconds (3000 ms)
		showTimeout = setTimeout(() => {
			let tippy = makeTippy(node, content);
			tippy.show();
			node._tippy = tippy; // Store tippy instance on the node
		}, 250);
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

/**
 * Renders a Cytoscape diagram using the given node data.
 * It sets up the styles and data, initializes the Cytoscape instance,
 * and if successful, sets up event handlers for the Cytoscape instance.
 *
 * @param {Object} nodeData - The data used to render the nodes and edges of the Cytoscape diagram.
 */
function renderCytoscapeDiagram(nodeData) {
	const styles = setupStylesAndData(nodeData);
	const cy = initializeCytoscape(nodeData, styles);

	if (cy) {
		setupEventHandlers(cy, nodeData);
	}
}

/**
 * Checks if the timeline data needs to be updated based on the context.
 * If the current context (representing either a character or a group chat session)
 * is different from the last known context, it fetches and prepares the required data.
 * The function then updates the layout configuration based on extension settings.
 * 
 * @returns {Promise<boolean>} Returns true if the timeline data was updated, and false otherwise.
 */
async function updateTimelineDataIfNeeded() {
	const context = getContext();
	if (!lastContext || lastContext.characterId !== context.characterId) {
		let data = {};

		if (!context.characterId) {
			let groupID = context.groupId;
			if (groupID) {
				//send the group where the ID within the dict is equal to groupID
				let group = context.groups.find(group => group.id === groupID);
				// for each group.chats, we add to a dict with the key being the index and the value being the chat
				for(let i = 0; i < group.chats.length; i++){
					console.log(group.chats[i]);
					data[i]= { "file_name": group.chats[i] };
				}
				lastTimelineData = await prepareData(data, true);
			}
		}
		else {
			data = await fetchData(context.characters[context.characterId].avatar);
			lastTimelineData = await prepareData(data);
		}

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

/**
 * Handler function that is called when the timeline button is clicked.
 * This function checks if the timeline data needs to be updated, handles modal display,
 * potentially renders the Cytoscape diagram, and sets the focus on a specific HTML element.
 *
 * @returns {Promise<void>}
 */
async function onTimelineButtonClick() {
	const dataUpdated = await updateTimelineDataIfNeeded();
	handleModalDisplay();
	if (dataUpdated) {
		renderCytoscapeDiagram(lastTimelineData);
	}
	closeOpenDrawers();
	document.getElementById('transparent-search').focus();
}

/**
 * Handler function that is called when the slash command is used.
 * This function checks if the timeline data needs to be updated, and potentially renders the Cytoscape diagram.
 * It also handles the `r` argument, which reloads the graph.
 * 
 * @param {Object} _ - The slash event object.
 * @param {string} reload - The argument passed to the slash command.
 * @returns {Promise<void>}
 */
function slashCommandHandler(_, reload) {
	if (reload == 'r'){
		lastContext = null;
	}
	onTimelineButtonClick();
}

/**
 * Entry point function for the jQuery script.
 * It handles adding UI components to the extension settings, binds events to various UI components,
 * and sets up event handlers for user interactions.
 */
jQuery(async () => {
	const settingsHtml = await $.get(`${extensionFolderPath}/timeline.html`);
	$("#extensions_settings").append(settingsHtml);
	$("#show_timeline_view").on("click", onTimelineButtonClick);
	registerSlashCommand('tl', slashCommandHandler, [], "Show the timeline, ` r ` to reload the graph", false, true);



    // Bind listeners to the specific inputs
    const idsToSettingsMap = {
        'tl_node_width': 'nodeWidth',
        'tl_node_height': 'nodeHeight',
        'tl_node_separation': 'nodeSeparation',
        'tl_edge_separation': 'edgeSeparation',
        'tl_rank_separation': 'rankSeparation',
        'tl_spacing_factor': 'spacingFactor',
        'tl_node_shape': 'nodeShape',
        'tl_curve_style': 'curveStyle',
		'tl_avatar_as_root': 'avatarAsRoot',
		'tl_use_chat_colors': 'useChatColors',
		'tl_lock_nodes': 'lockNodes',
		'bookmark-color-picker': 'bookmarkColor',
		'edge-color-picker': 'edgeColor',
		'user-node-color-picker': 'userNodeColor',
		'char-node-color-picker': 'charNodeColor',
    };

	for (let [id, settingName] of Object.entries(idsToSettingsMap)) {
		if (id.includes("color-picker")) { // or a more specific way to identify color pickers if needed
			$(`#${id}`).on('change', function (evt) {
				onInputChange($(this), settingName, evt.detail.rgba);
			});
		} else {
			$(`#${id}`).on('input', function () {
				onInputChange($(this), settingName);
			});
		}
	}


	$(document).ready(function () {
		$("#toggleStyleSettings").click(function () {
			$("#styleSettingsArea").toggleClass("hidden");
		});
		$("#toggleColorSettings").click(function () {
			$("#colorSettingsArea").toggleClass("hidden");
		});
	});

	$("#resetSettingsBtn").click(function () {
		extension_settings.timeline = Object.assign({}, defaultSettings);
		loadSettings();
		saveSettingsDebounced();
	});


	loadSettings();
});

/**
 * Event handler function that is called when an input element's value is changed.
 * It updates the value in the `extension_settings.timeline` object based on the input element and the type of the input.
 *
 * @param {Object} element - The jQuery object representing the changed input element.
 * @param {string} settingName - The setting name corresponding to the changed input.
 * @param {Object|null} rgbaValue - The rgba value for color picker inputs (optional).
 */
function onInputChange(element, settingName, rgbaValue = null) {
	let value;

	// Check if the element is a checkbox
	if (element.is(":checkbox")) {
		value = element.prop("checked");
	}
	// Check if the element is a color picker
	else if (element.is("toolcool-color-picker")) {
		value = rgbaValue;
	}
	else {
		value = element.val();
	}

	extension_settings.timeline[settingName] = value;

	// Only update the label if the value is numeric
	if (!isNaN(value)) {
		$(`#${element.attr('id')}_value`).text(Math.round(value));
	}
	lastContext = null; // Invalidate the last context to force a data update
	saveSettingsDebounced();
}