//This script is going to use GoJS to create a tree diagram
//The content of the tree will be a messages of a conversation, with the root being the first message
// Branches will be at each bookmarked message
// The tree should not be able to be edited, but should be able to be moved around


var script = document.createElement('script');
script.src = 'scripts/extensions/third-party/st-tree-extension/go.js';
$('body').append(script);


import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { characters, getRequestHeaders, openCharacterChat } from "../../../../script.js";


let goMake = go.GraphObject.make;


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
	let nodeData = [];
	let keyCounter = 1;
	let previousNodes = {};

	// Initialize root node
	nodeData.push({
		key: "root",
		text: "Start of Conversation",  // or any text you prefer
		// Add any additional properties you want for the root
	});

	// Initialize previousNodes
	allChats[0].forEach(({ file_name }) => {
		previousNodes[file_name] = "root";
	});

	for (let messagesAtIndex = 0; messagesAtIndex < allChats.length; messagesAtIndex++) {
		let groups = groupMessagesByContent(allChats[messagesAtIndex]);

		for (const [text, group] of Object.entries(groups)) {
			let nodeKey = `message${keyCounter}`;
			let parentNodeKey = previousNodes[group[0].file_name];

			let node = createNode(nodeKey, parentNodeKey, text, group);
			nodeData.push(node);
			keyCounter += 1;

			updatePreviousNodes(previousNodes, nodeKey, group);
		}
	}

	return nodeData;
}

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

// Create a node
function createNode(nodeKey, parentNodeKey, text, group) {
	let bookmark = group.find(({ message }) => !!message.extra && !!message.extra.bookmark_link);
	let isBookmark = Boolean(bookmark);
	let bookmarkName = isBookmark ? bookmark.message.extra.bookmark_link : null;

	let { is_name, is_user, name, send_date } = group[0].message;  // Assuming these properties exist in every message

	return {
		key: nodeKey,
		parent: parentNodeKey,
		text: text,
		isBookmark: isBookmark,
		bookmarkName: bookmarkName,
		file_name: group[0].file_name,
		is_name: is_name,
		is_user: is_user,
		name: name,
		send_date: send_date,
		messageIndex: group[0].index, // assuming index exists in each group item
		color: isBookmark ? generateUniqueColor() : null, // assuming you have a function to generate unique colors
		chat_sessions: group.map(({ file_name }) => file_name), // add chat sessions to the node
	};
	
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
function convertToGoJsTree(channelHistory) {
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
	return convertToGoJsTree(chat_dict);
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

	let message = $(`div[mesid=${messageId}]`); // Select the message div by the messageId
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



// Function to create a node template
function createNodeTemplate(goMake) {
    return goMake(go.Node, "Auto",
        {
            doubleClick: nodeClickHandler,
            contextMenu: createContextMenuAdornment(goMake),
        },
        createShape(goMake),
        { toolTip: createTooltipAdornment(goMake) }
    );
}

// Function to handle click events on nodes
function nodeClickHandler(e, obj) {
    let node = obj.part;
    let depth = getNodeDepth(node);
    let chatSessions = obj.part.data.chat_sessions;
    if (!(chatSessions && chatSessions.length > 1)) {
        let chatSessionName = obj.part.data.file_name;
        navigateToMessage(chatSessionName, depth);
    }
}

// Function to get node depth
function getNodeDepth(node) {
    let depth = 0;
    while (node.findTreeParentNode() !== null) {
        node = node.findTreeParentNode();
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
function highlightPathToRoot(myDiagram, node, currentHighlightThickness = 4) {
    if (node === null) return;
    let color = node.data.color;
    let parentNode = node;
    while (parentNode !== null) {
        let link = parentNode.findLinksInto();
        while (link.next()) {
            myDiagram.model.set(link.value.data, "isHighlight", true);
            myDiagram.model.set(link.value.data, "color", color);
            myDiagram.model.set(link.value.data, "highlightThickness", currentHighlightThickness);
        }
        parentNode = parentNode.findTreeParentNode();
    }
    currentHighlightThickness = Math.min(currentHighlightThickness + 0.1, 6); 
}

function createLegend(goMake) {
	let legend = goMake(go.Diagram, "legendDiv");

	// Create a simple node template for the legend
	legend.nodeTemplateMap.add("", goMake(go.Node, "Auto",
		goMake(go.Shape, "Circle", { width: 25, height: 25 },
			new go.Binding("fill", "color"),
		),
		goMake(go.TextBlock,
			new go.Binding("text", "text"),
		)
	));

	legend.model = new go.GraphLinksModel(
		[  // specify the contents of the Palette
			{ color: "lightblue", text: "User" },
			{ color: "white", text: "Non-user" },
			{ color: "gold", text: "Bookmark" }
		]
	);

	return legend;
}



function rotateTree(diagram) {
	const layout = diagram.layout;
	if (!layout) {
		console.error('Diagram layout is undefined');
		return;
	}
	// This rotates the layout by 90 degrees each time it's clicked
	layout.angle = (layout.angle + 90) % 360;
	layout.invalidateLayout();  // This is necessary to redraw the diagram
}

function adjustTreeRotation(diagram) {
	const layout = diagram.layout;
	if (!layout) {
		console.error('Diagram layout is undefined');
		return;
	}
	// Compare the width and height of the viewport
	if (window.innerWidth > window.innerHeight) {
		// If the width is greater, set the layout angle to 0
		layout.angle = 0;
	} else {
		// If the height is greater, set the layout angle to 90
		layout.angle = 90;
	}
	layout.invalidateLayout();  // This is necessary to redraw the diagram
}


let myDiagram = null;  // Moved the declaration outside of the function

function renderTreeDiagram(nodeData) {
	console.log(nodeData);
	let myDiagramDiv = document.getElementById('myDiagramDiv');
	if (!myDiagramDiv) {
		console.error('Unable to find element with id "myDiagramDiv". Please ensure the element exists at the time of calling this function.');
		return;
	}
	// Clear the diagram's contents before rendering a new tree
	// myDiagramDiv.innerHTML = '';  // You can remove this line

	let goMake = go.GraphObject.make;

	if (myDiagram === null) {
		myDiagram = goMake(go.Diagram, myDiagramDiv, {
			"undoManager.isEnabled": true,
			allowMove: true,
			allowCopy: false,
			allowDelete: false,
			allowInsert: false,
			allowZoom: true,
			initialAutoScale: go.Diagram.Uniform
		});
		myDiagram.nodeTemplate = createNodeTemplate(goMake);
		myDiagram.linkTemplate = createLinkTemplate(goMake);
	}

	let model = goMake(go.TreeModel);
	model.nodeDataArray = nodeData;
	myDiagram.model = model;

    nodeData.forEach(node => {
        if (node.isBookmark) {
            let nodeInDiagram = myDiagram.findNodeForKey(node.key);
            highlightPathToRoot(myDiagram, nodeInDiagram);
        }
    });

	myDiagram.contextMenu =
		goMake(go.Adornment, "Vertical",
			goMake("ContextMenuButton",
				goMake(go.TextBlock, "Rotate Tree"),
				{
					click: function (e, obj) {
						rotateTree(myDiagram);
					}
				}
			)
		);

    myDiagram.layout = createLayout(goMake);

	adjustTreeRotation(myDiagram); 


    const toggleButton = document.getElementById('toggleButton');
    if (toggleButton) {
        toggleButton.addEventListener('click', function () {
            toggleTreeDirection(myDiagram);
        });
    }
	let legend = createLegend(go.GraphObject.make);
    // const myOverviewDiv = document.getElementById('myOverviewDiv');
    // const myOverview = goMake(go.Overview, myOverviewDiv);
    // myOverview.observed = myDiagram; 
}

// Function to create layout
function createLayout(goMake) {
    return goMake(go.TreeLayout, {
        angle: 90,
        layerSpacing: 35
    });
}

// Function to create a link template
function createLinkTemplate(goMake) {
    return goMake(go.Link,
        { routing: go.Link.Orthogonal, corner: 5 },
        goMake(go.Shape,
            { strokeWidth: 3 },
            new go.Binding("stroke", "", (data) => data.isHighlight ? data.color : "#555"),
            new go.Binding("strokeWidth", "highlightThickness", (h) => h ? h : 3)
        )
    );
}

// Function to toggle tree direction
function toggleTreeDirection(diagram) {
    const layout = diagram.layout;
    if (!layout) {
        console.error('Diagram layout is undefined');
        return;
    }
    layout.angle = layout.angle === 0 ? 90 : 0;
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



// When the user clicks the button
async function onTreeButtonClick() {
	const context = getContext();
	if (!lastContext || lastContext.characterId !== context.characterId) {
		// If the context has changed, fetch new data and render the tree
		let data = await fetchData(context.characters[context.characterId].avatar);
		let treeData = await prepareData(data);
		renderTreeDiagram(treeData);
		lastContext = context; // Update the lastContext to the current context
	}
	handleModalDisplay();
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
