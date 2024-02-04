import { characters, getRequestHeaders } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';


/**
 * Preprocesses chat sessions to aggregate messages from different files into a unified structure.
 * For each message position/index across all chat files, it creates an array of messages at that position
 * from every chat file, effectively transposing the structure.
 *
 * @param {Object} channelHistory - An object where keys are file names and values are arrays of chat messages.
 * @returns {Array} allChats - A 2D array where each sub-array corresponds to a message index and contains
 *                             objects detailing the file name, index, and actual message for each chat file.
 */
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
                message,
            });
        });
    }

    return allChats;
}

/**
 * Constructs nodes and associated edges for each message index based on processed chat sessions.
 * Nodes are created for each unique message content across chat files at each message position,
 * and edges represent the message order and source file. The function also handles special
 * nodes, such as swipes, and ensures they are properly connected in the graph.
 *
 * @param {Array} allChats - A 2D array resulting from `preprocessChatSessions`, where each sub-array
 *                           corresponds to a message index and contains objects detailing the file name,
 *                           index, and actual message for each chat file.
 * @param {Object} allChatFileNamesAndLengths - A dictionary `{file_name: length_in_messages}` for all existing chat files.
 *                                              (Hint: See `prepareData` and `convertToCytoscapeElements`.)
 * @returns {Array} cyElements - A list of node and edge objects suitable for the Cytoscape graph library.
 *
 * Behavior:
 * 1. Initializes a root node and sets up tracking for previous nodes.
 * 2. Iterates over each `messageId` (sequential numbering of chat messages), grouping messages at the same position by content.
 * 3. For each message group, constructs a node and an associated edge.
 * 4. Handles special nodes, such as swipes, and ensures they are properly added.
 * 5. Returns the full list of constructed nodes and edges.
 */
function buildGraph(allChats, allChatFileNamesAndLengths) {
    let cyElements = [];
    let keyCounter = 1;
    let previousNodes = {};
    let parentSwipeData = {};

    // Gather name(s) of AI characters from chat history, for root node
    let characterNames = new Set();
    for (let messageId = 0; messageId < allChats.length; messageId++) {
        const messages = allChats[messageId];
        messages.forEach((messageObj, index) => {
            const { message } = messageObj;
            if (!message.is_user && !message.is_system) {
                characterNames.add(message.name);
            }
        });
    }
    const rootNodeName = [...characterNames].sort().join(', ');

    // Initialize root node
    cyElements.push({
        group: 'nodes',
        data: {
            id: 'root',
            label: 'root',
            name: rootNodeName,
            send_date: '',  // not a message
            x: 0,
            y: 0,
        },
    });

    // Initialize previousNodes (anchoring the beginning of each chat to the graph root node)
    allChats[0].forEach(({ file_name }) => {
        previousNodes[file_name] = 'root';
    });

    for (let messageId = 0; messageId < allChats.length; messageId++) {
        // Group messages at this `messageId` (according to sequential message numbering in chat session),
        // across all chats, by their text content.
        let groups = groupMessagesByContent(allChats[messageId]);

        for (const [text, group] of Object.entries(groups)) {
            // Now `group` contains the messages, at this `messageId`, that have `text` as their text content.

            const nodeId = `message${keyCounter}`;
            const node = createNode(nodeId, messageId, text, group, allChatFileNamesAndLengths);

            // Extract all unique swipes from this message group.
            // In each chat, the AI's greeting message is at index 0.
            // Although in the UI, the alternate AI greetings are stored as swipes, in the timeline view we show them as separate messages.
            const allSwipes = [];
            let uniqueSwipes = [];
            if (messageId !== 0) {
                group.forEach(messageObj => {
                    const swipes = messageObj.message.swipes || [];
                    allSwipes.push(...swipes);
                });
                // Deduplicate swipes, and omit swipes with the same content as the message.
                uniqueSwipes = [...new Set(allSwipes)].filter(swipeText => swipeText !== text);
            }

            // Treat each message in this message group. A message may have multiple parents (happens for a canned reply, used in several chats at the same chat depth).
            const uniqueParents = new Set();
            for (const messageObj of group) {
                const parentNodeId = previousNodes[messageObj.file_name];

                // Store swipe node and edge data for the each unique parent node.
                if (messageId !== 0 && !uniqueParents.has(parentNodeId)) {
                    uniqueParents.add(parentNodeId);

                    if (!parentSwipeData[parentNodeId]) {
                        parentSwipeData[parentNodeId] = {
                            storedSwipes: [],
                            totalSwipes: 0,
                            currentSwipeIndex: uniqueSwipes.indexOf(text),
                        };
                    }

                    parentSwipeData[parentNodeId].totalSwipes += uniqueSwipes.length;

                    // Store node and edge data for each swipe in parentSwipeData
                    uniqueSwipes.forEach(swipeText => {
                        const swipeNodeId = `swipe${keyCounter}-${parentSwipeData[parentNodeId].totalSwipes}`;
                        const swipeIndex = allSwipes.indexOf(swipeText);  // Index of the swipe in the original swipes list
                        const swipeNode = {
                            ...node,
                            id: swipeNodeId,
                            msg: swipeText,
                            isSwipe: true,
                            swipeId: swipeIndex,  // Store the index as swipeId in the node data
                        };
                        delete swipeNode.swipes;

                        const swipeEdge = {
                            id: `edgeSwipe${keyCounter}`,
                            source: parentNodeId,
                            target: swipeNodeId,
                            isSwipe: true,
                            swipeId: swipeIndex,  // Store the index as swipeId in the edge data
                        };

                        parentSwipeData[parentNodeId].storedSwipes.push({ node: swipeNode, edge: swipeEdge });
                        keyCounter += 1;
                    });
                }

                cyElements.push({
                    group: 'nodes',
                    data: node,
                });

                // Create edge for this node
                cyElements.push({
                    group: 'edges',
                    data: {
                        id: `edge${keyCounter}`,
                        source: parentNodeId,
                        target: nodeId,
                    },
                });

                // Keep track of the originating node for each message in the group
                previousNodes[messageObj.file_name] = nodeId;

                keyCounter += 1;
            }
        }
    }

    // Update cyElements with data from parentSwipeData
    cyElements.forEach(element => {
        if (element.group === 'nodes' && parentSwipeData[element.data.id]) {
            Object.assign(element.data, parentSwipeData[element.data.id]);
        }
    });

    return cyElements;
}


/**
 * Constructs a Cytoscape node object based on provided message details.
 * The function identifies special messages, such as checkpoints, and adjusts the node
 * properties accordingly. The returned node contains properties that help render and
 * differentiate it within the Cytoscape graph, such as color for checkpoints.
 *
 * @param {string} nodeId - The unique ID to assign to the node.
 * @param {number} messageId - ID of the message, in the sequential message numbering of the chat session.
 *                             Note this is shared by all messages in the same message `group`.
 * @param {string} text - The message content.
 * @param {Array} group - A list of message objects that share the same content across chat files.
 * @param {Object} allChatFileNamesAndLengths - A dictionary `{file_name: length_in_messages}` for all existing chat files.
 *                                              (Hint: See `prepareData` and `convertToCytoscapeElements`.)
 * @returns {Object} - A Cytoscape node object with properties set based on the message details.
 *
 * Behavior:
 * 1. Checks if any message in the group is a checkpoint and extracts relevant details.
 * 2. Determines node properties, such as color for checkpoints, based on the message details.
 * 3. Constructs and returns the node object.
 */
function createNode(nodeId, messageId, text, group, allChatFileNamesAndLengths) {
    let bookmark = group.find(({ message }) => {
        // Check if the message is from the system and if it indicates a checkpoint.
        //
        // This check is only needed for compatibility with old chat files. ST has not used
        // this marker since summer 2023.
        //
        // There is still a `bookmark_created` system message in `SillyTavern/public/script.js`,
        // which uses the new "checkpoint" term (instead of the old "bookmark", as here), but
        // that message has never been used in chat files.
        if (message.is_system && message.mes.includes('Bookmark created! Click here to open the bookmark chat')) return true;

        // Original bookmark case
        return !!message.extra && !!message.extra.bookmark_link;
    });

    let isBookmark = Boolean(bookmark);

    // Extract bookmarkName and fileNameForNode depending on checkpoint type
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

    // Omit dead link, if the checkpoint chat file (that the link points to) no longer exists.
    //
    // NOTE: For the opposite situation, we can't do anything here. It might be that a checkpoint link
    // has been severed by overwriting it with a new one (on the same chat message), but the old
    // checkpoint chat file still exists. In that case, only the new checkpoint will be shown in the legend,
    // and the old one will appear only as an independent chat file in the buttons on the graph nodes
    // that match its messages.
    if (isBookmark && !allChatFileNamesAndLengths.hasOwnProperty(`${bookmarkName}.jsonl`)) {
        console.info(`Timelines: createNode: omitting dead link to '${bookmarkName}'; link target chat file '${bookmarkName}.jsonl' does not exist`);
        isBookmark = false;
        bookmarkName = undefined;
        fileNameForNode = undefined;
    }

    let { is_name, is_user, name, send_date, is_system } = group[0].message;  // Added is_system here

    // Find chat sessions that have this message (and their lengths)
    let chat_sessions = {};
    for (const {file_name, index} of group) {
        // console.debug(`messageId (in chat) ${messageId}: graph node '${nodeId}' for chat '${file_name}' [${allChatFileNamesAndLengths[file_name]} messages]`);
        chat_sessions[file_name] = {
            messageId: messageId,  // we don't strictly need this per-session copy of `messageId`, but it's sometimes convenient.
            indexInGroup: index,
            length: allChatFileNamesAndLengths[file_name],
        };
    }

    return {
        id: nodeId,
        msg: text,
        chat_depth: messageId,  // same for all messages in the same message group
        isBookmark: isBookmark,
        bookmarkName: bookmarkName,
        file_name: fileNameForNode,
        is_name: is_name,
        is_user: is_user,
        is_system: is_system,
        name: name,
        send_date: send_date,
        color: isBookmark ? generateUniqueColor(text) : null,
        chat_sessions: chat_sessions,  // ES2015 and later preserve string keys in their insertion order, so this can also be used as an ordered list of sessions.
    };
}

/**
 * Groups messages by their content to create a collection of unique messages.
 * This function helps in creating a representative node for each unique message across chat sessions.
 *
 * @param {Array} messages - A list of message objects, each containing file_name and message details.
 * @returns {Object} groups - An object where the key is the unique message content and the value is
 *                            an array of message objects that share that content.
 */
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
            groups[message.mes].push({ file_name, index, message });  // `index` is the index of this message object in the original `messages` array.
        } catch (e) {
            console.error(`Message Grouping Error: ${e}: ${JSON.stringify(message, null, 4)}`);
        }
    });
    return groups;
}

/**
 * Postprocesses the constructed nodes, allowing for potential modifications or additions.
 * Currently a placeholder; it can be expanded with additional steps if required in the future.
 *
 * @param {Array} nodeData - A list of node objects constructed by the buildGraph function.
 * @returns {Array} nodeData - The potentially modified list of node objects.
 */
// TODO: Could be removed. Strictly, we don't need a placeholder, unless the intention is to be able to monkey-patch a different function in at runtime (which, it seems, it isn't).
function postprocessNodes(nodeData) {
    // Placeholder for now; add additional steps if needed
    return nodeData;
}

/**
 * Converts a given chat history into elements suitable for visualization in Cytoscape.
 * This function orchestrates the entire process, from preprocessing chat sessions to postprocessing nodes.
 *
 * @param {Object} chatHistory - An object containing chat files as keys and their message sequences as values.
 * @returns {Array} nodeData - A list of node (and potentially edge) objects suitable for Cytoscape graph library.
 */
function convertToCytoscapeElements(chatHistory) {
    let allChats = preprocessChatSessions(chatHistory);

    // Gather chat session lengths (in number of messages) for last-message detection.
    // dictmap {k: v} -> {k: v.length}
    let allChatFileNamesAndLengths = {};
    for (const [key, val] of Object.entries(chatHistory)) {
        allChatFileNamesAndLengths[key] = val.length;
    }

    let nodeData = buildGraph(allChats, allChatFileNamesAndLengths);
    nodeData = postprocessNodes(nodeData);
    return nodeData;
}

/**
 * Seedable RNG from https://stackoverflow.com/a/47593316
 *
 * "sfc32 is part of the PractRand random number testing suite (which it passes of course).
 *  sfc32 has a 128-bit state and is very fast in JS."
 */
function sfc32(a, b, c, d) {
    return function() {
        a |= 0; b |= 0; c |= 0; d |= 0;
        var t = (a + b | 0) + d | 0;
        d = d + 1 | 0;
        a = b ^ b >>> 9;
        b = c + (c << 3) | 0;
        c = (c << 21 | c >>> 11);
        c = c + t | 0;
        return (t >>> 0) / 4294967296;
    }
}

/**
  * Hash function for RNG seeding, from https://stackoverflow.com/a/47593316
  *
  * Side note: Only designed & tested for seed generation,
  * may be suboptimal as a general 128-bit hash.
  *
  * @param {String} str - String to compute the seed from.
  */
function cyrb128(str) {
    let h1 = 1779033703, h2 = 3144134277,
        h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
        k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    h1 ^= (h2 ^ h3 ^ h4), h2 ^= h1, h3 ^= h1, h4 ^= h1;
    return [h1>>>0, h2>>>0, h3>>>0, h4>>>0];
}

/**
 * Generate a unique random RGB color string.
 *
 * @param {str} Optional. If given, the same `text` always maps to the same random color.
 * @returns {string} Random RGB color in the format "rgb(r, g, b)".
 */
export function generateUniqueColor(str) {
    let random;
    if (str) {
        let seed = cyrb128(str);
        random = sfc32(seed[0], seed[1], seed[2], seed[3]);
    } else {
        random = Math.random;
    }

    const randomRGBValue = () => Math.floor(random() * 256);
    return `rgb(${randomRGBValue()}, ${randomRGBValue()}, ${randomRGBValue()})`;
}

/**
 * Fetches all chats associated with a specific character based on their avatar URL.
 *
 * @async
 * @param {string} characterAvatar - The URL of the character's avatar, used as an identifier to fetch chats.
 * @returns {Promise<Object|undefined>} A promise that resolves with the JSON representation of the chat data
 *                                      or undefined if the fetch request is not successful.
 * @throws Will throw an error if there's an issue with the fetch request itself.
 */
export async function fetchData(characterAvatar) {
    const response = await fetch('/api/characters/chats', {
        method: 'POST',
        body: JSON.stringify({ avatar_url: characterAvatar }),
        headers: getRequestHeaders(),
    });
    if (!response.ok) {
        return;
    }
    return response.json();
}

/**
 * Prepares chat data by fetching detailed chat content, sorting by file names, and converting
 * the consolidated data into a format suitable for Cytoscape visualization. This function
 * fetches individual or group chat data based on the `isGroupChat` flag.
 *
 * @async
 * @param {Object} data - A dictionary containing summary or metadata of chats.
 * @param {boolean} isGroupChat - A flag indicating whether the chat data is for group chats (true)
 *                                or individual chats (false).
 * @returns {Promise<Array>} A promise that resolves with a list of nodes (and potentially edges)
 *                           suitable for the Cytoscape graph library.
 * @throws Will throw an error if the fetch request or data processing encounters issues.
 */
export async function prepareData(data, isGroupChat) {
    const context = getContext();
    let chat_dict = {};
    let chat_list = Object.values(data).sort((a, b) => a['file_name'].localeCompare(b['file_name'])).reverse();

    for (const { file_name } of chat_list) {
        try {
            const endpoint = isGroupChat ? '/api/chats/group/get' : '/api/chats/get';
            const requestBody = isGroupChat
                ? JSON.stringify({ id: file_name })
                : JSON.stringify({
                    ch_name: characters[context.characterId].name,
                    file_name: file_name.replace('.jsonl', ''),
                    avatar_url: characters[context.characterId].avatar,
                });

            const chatResponse = await fetch(endpoint, {
                method: 'POST',
                headers: getRequestHeaders(),
                body: requestBody,
                cache: 'no-cache',
            });

            if (!chatResponse.ok) {
                continue;
            }

            const currentChat = await chatResponse.json();
            if (!isGroupChat) {
                // remove the first message, which is metadata, only for individual chats
                currentChat.shift();
            }
            chat_dict[file_name] = currentChat;

        } catch (error) {
            console.error(error);
        }
    }
    return convertToCytoscapeElements(chat_dict);
}
