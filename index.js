//This script is going to use GoJS to create a tree diagram
//The content of the tree will be a messages of a conversation, with the root being the first message
// Branches will be at each bookmarked message
// The tree should not be able to be edited, but should be able to be moved around




import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { characters, getRequestHeaders } from "../../../../script.js";


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
	messages.forEach(({ file_name, index, message }) => {
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

function renderTreeDiagram(nodeData) {
	console.log(nodeData);
	let myDiagramDiv = document.getElementById('myDiagramDiv');
	if (!myDiagramDiv) {
		console.error('Unable to find element with id "myDiagramDiv". Please ensure the element exists at the time of calling this function.');
		return;
	}
	myDiagramDiv.style.width = "800px";  // Set appropriate size
	myDiagramDiv.style.height = "600px"; // Set appropriate size
	let myDiagram = goMake(go.Diagram, myDiagramDiv, {
		"undoManager.isEnabled": true,
		allowMove: true,
		allowCopy: false,
		allowDelete: false,
		allowInsert: false,
	});
	myDiagram.nodeTemplate =
		goMake(go.Node, "Auto",
			goMake(go.Shape, "Circle",
				{ width: 25, height: 25 },
				new go.Binding("fill", "is_user", function (is_user) {
					return is_user ? "lightblue" : "white";

				}),
				new go.Binding("stroke", "isBookmark", function (isBookmark) {
					return isBookmark ? "gold" : null;
				}),
				new go.Binding("strokeWidth", "isBookmark", function (isBookmark) {
					return isBookmark ? 3 : 0;
				}),
			),
			
			{  // Tooltip Adornment
				toolTip:
					goMake(go.Adornment, "Auto",
						goMake(go.Shape, { fill: "#EFEFCC" }),
						goMake(go.TextBlock, { margin: 4 },
							new go.Binding("text", "", function (d) {
								let text = `Text: ${d.text ? d.text : "N/A"}`;
								let fileName = d.file_name ? `\nFile Name: ${d.file_name}` : "";
								let sendDate = d.send_date ? `\nSend Date: ${d.send_date}` : "";
								let bookmarkName = d.bookmarkName ? `\nBookmark Name: ${d.bookmarkName}` : "";
								return text + fileName + sendDate + bookmarkName;
							}))
					)
			}
		);



	myDiagram.layout = goMake(go.TreeLayout, {
		angle: 90,  // angle to make the tree grow upwards
		layerSpacing: 35  // you can adjust the spacing to your preference
	});
	myDiagram.linkTemplate = goMake(go.Link,
		{ routing: go.Link.Orthogonal, corner: 5 },
		goMake(go.Shape, { strokeWidth: 3, stroke: "#555" })  // line properties
	);

	let model = goMake(go.TreeModel);
	model.nodeDataArray = nodeData;
	myDiagram.model = model;

	function toggleTreeDirection(diagram) {
		const layout = diagram.layout;
		layout.angle = layout.angle === 0 ? 90 : 0;
		layout.doLayout();  // re-layout the tree
	}

	const toggleButton = document.getElementById('toggleButton');
	if (toggleButton) {
		toggleButton.addEventListener('click', function () {
			toggleTreeDirection(myDiagram);
		});
	}

}

function handleModalDisplay() {
	let modal = document.getElementById("myModal");
	let span = document.getElementsByClassName("close")[0];
	span.onclick = function () {
		modal.style.display = "none";
	}
	window.onclick = function (event) {
		if (event.target == modal) {
			modal.style.display = "none";
		}
	}
	modal.style.display = "block";
}

async function onTreeButtonClick() {
	const context = getContext();
	let data = await fetchData(context.characters[context.characterId].avatar);
	let treeData = await prepareData(data);
	renderTreeDiagram(treeData);
	handleModalDisplay();
}

// This function is called when the extension is loaded
jQuery(async () => {
  // This is an example of loading HTML from a file
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);

  // Append settingsHtml to extensions_settings
  // extension_settings and extensions_settings2 are the left and right columns of the settings menu
  // You can append to either one
  $("#extensions_settings").append(settingsHtml);

  // A button to show the tree view
  $("#show_tree_view").on("click", onTreeButtonClick);
  // Load settings when starting things up (if you have any)
  loadSettings();
});
