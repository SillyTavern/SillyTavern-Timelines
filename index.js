// @Technologicat's TODOs, early 2024:
// TODO: Node full info panel placement - try to avoid hindering navigation of the timeline the node belongs to.
// TODO: Hotkeys (Tab to jump between chat branches matching a search).
// TODO: Icon sizes at the top right of the timeline view should match each other.
// TODO: Maybe refactor the closing of the Tippy tooltips into a one-size-fits-all solution. (Search for `closeModal` - the tooltips are closed when the modal is.)

// @city-unit's original TODOs:
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

    if (type === 'css') {
        elem = document.createElement('link');
        elem.rel = 'stylesheet';
        elem.href = src;
    } else if (type === 'js') {
        elem = document.createElement('script');
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
const extensionName = 'SillyTavern-Timelines';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;

// Load CSS file
loadFile(`${extensionFolderPath}cytoscape-context-menus.min.css`, 'css');
loadFile(`${extensionFolderPath}light.min.css`, 'css');
loadFile(`${extensionFolderPath}material.min.css`, 'css');
loadFile(`${extensionFolderPath}light-border.min.css`, 'css');
loadFile(`${extensionFolderPath}translucent.min.css`, 'css');
loadFile(`${extensionFolderPath}tippy.css`, 'css');
loadFile(`${extensionFolderPath}tl_style.css`, 'css');

// Load JavaScript files
loadFile('scripts/extensions/third-party/SillyTavern-Timelines/cytoscape.min.js', 'js');
loadFile(`${extensionFolderPath}dagre.js`, 'js', function () {
    loadFile(`${extensionFolderPath}cytoscape-dagre.min.js`, 'js');
});
loadFile(`${extensionFolderPath}tippy.umd.min.js`, 'js', function () {
    loadFile(`${extensionFolderPath}cytoscape-popper.min.js`, 'js');
});
loadFile(`${extensionFolderPath}cytoscape-context-menus.min.js`, 'js');

import { extension_settings, getContext } from '../../../extensions.js';
import { event_types, eventSource, saveSettingsDebounced } from '../../../../script.js';

import { navigateToMessage, closeModal, closeTippy, handleModalDisplay, closeOpenDrawers } from './tl_utils.js';
import { setupStylesAndData, highlightElements, restoreElements } from './tl_style.js';
import { fetchData, prepareData } from './tl_node_data.js';
import { toggleGraphOrientation, highlightNodesByQuery, setGraphOrientationBasedOnViewport, getGraphOrientation } from './tl_graph.js';
import { registerSlashCommand } from '../../../slash-commands.js';
import { fixMarkdown } from '../../../power-user.js';

let defaultSettings = {
    nodeWidth: 25,
    nodeHeight: 25,
    nodeSeparation: 50,
    edgeSeparation: 10,
    rankSeparation: 50,
    spacingFactor: 1,
    tooltipFixed : false,
    align: 'UL',
    nodeShape: 'ellipse',
    curveStyle: 'taxi',
    swipeScale: false,
    avatarAsRoot: true,
    showLegend: true,
    bookmarkColor: '#ff0000',
    useChatColors: false,
    charNodeColor: '#FFFFFF',
    userNodeColor: '#ADD8E6',
    edgeColor: '#555',
    autoExpandSwipes: false,
    zoomToCurrentChatZoom: 1.0,
    enableMinZoom: true,
    minZoom: 0.1,
    enableMaxZoom: true,
    maxZoom: 3.0,
    gpuAcceleration: true,
};

let currentlyHighlighted = null;  // selector for active legend item
let lastContext = null;  // for tracking whether we need to refresh the graph
let lastTimelineData = null;  // last fetched and prepared timeline data
let theCy = null;  // Cytoscape instance
let layout = {};  // Cytoscape graph layout configuration; populated later in `updateTimelineDataIfNeeded`

/**
 * Asynchronously loads settings from `extension_settings.timeline`,
 * filling in with default settings if some are missing.
 *
 * After loading the settings, it also updates the UI elements
 * with the appropriate values from the loaded settings.
 */
async function loadSettings() {
    // Ensure extension_settings.timeline exists
    if (!extension_settings.timeline) {
        console.info('Creating extension_settings.timeline');
        extension_settings.timeline = {};
    }

    // Check and merge each default setting if it doesn't exist
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (!extension_settings.timeline.hasOwnProperty(key)) {
            console.info(`Setting default for: ${key}`);
            extension_settings.timeline[key] = value;
        }
    }

    // Update UI elements
    $('#tl_node_width').val(extension_settings.timeline.nodeWidth).trigger('input');
    $('#tl_node_height').val(extension_settings.timeline.nodeHeight).trigger('input');
    $('#tl_node_separation').val(extension_settings.timeline.nodeSeparation).trigger('input');
    $('#tl_edge_separation').val(extension_settings.timeline.edgeSeparation).trigger('input');
    $('#tl_rank_separation').val(extension_settings.timeline.rankSeparation).trigger('input');
    $('#tl_spacing_factor').val(extension_settings.timeline.spacingFactor).trigger('input');
    $('#tl_align').val(extension_settings.timeline.align).trigger('input');
    $('#tl_tooltip_fixed').prop('checked', extension_settings.timeline.fixedTooltip).trigger('input');
    $('#tl_gpu_acceleration').prop('checked', extension_settings.timeline.gpuAcceleration).trigger('input');
    $('#tl_node_shape').val(extension_settings.timeline.nodeShape).trigger('input');
    $('#tl_curve_style').val(extension_settings.timeline.curveStyle).trigger('input');
    $('#tl_swipe_scale').prop('checked', extension_settings.timeline.swipeScale).trigger('input');
    $('#tl_avatar_as_root').prop('checked', extension_settings.timeline.avatarAsRoot).trigger('input');
    $('#tl_show_legend').prop('checked', extension_settings.timeline.showLegend).trigger('input');
    $('#tl_use_chat_colors').prop('checked', extension_settings.timeline.useChatColors).trigger('input');
    $('#tl_auto_expand_swipes').prop('checked', extension_settings.timeline.autoExpandSwipes).trigger('input');
    $('#tl_zoom_current_chat').val(extension_settings.timeline.zoomToCurrentChatZoom).trigger('input');
    $('#tl_zoom_min_cb').prop('checked', extension_settings.timeline.enableMinZoom).trigger('input');
    $('#tl_zoom_min').val(extension_settings.timeline.minZoom).trigger('input');
    $('#tl_zoom_min').prop("disabled", !extension_settings.timeline.enableMinZoom);
    $('#tl_zoom_max_cb').prop('checked', extension_settings.timeline.enableMaxZoom).trigger('input');
    $('#tl_zoom_max').val(extension_settings.timeline.maxZoom).trigger('input');
    $('#tl_zoom_max').prop("disabled", !extension_settings.timeline.enableMaxZoom);
    $('#bookmark-color-picker').attr('color', extension_settings.timeline.bookmarkColor);
    $('#edge-color-picker').attr('color', extension_settings.timeline.edgeColor);
    $('#user-node-color-picker').attr('color', extension_settings.timeline.userNodeColor);
    $('#char-node-color-picker').attr('color', extension_settings.timeline.charNodeColor);
}

let isTapTippyActive = false;

/**
 * Determines preferred and fallback placements for a Tippy tooltip.
 *
 * Accounts for graph orientation, and avoids covering those nearby nodes that are
 * most likely to be important.
 *
 * @param {Boolean} isSwipe - If true, get placements for a swipe node.
 *                            If false, get placements for a general node.
 * @returns {Object} - A dictionary with keys `preferred` and `fallback`.
 *                     The `fallback` item can be used with `popperOptions` to customize `flip`.
 *                     How to:
 *                       https://atomiks.github.io/tippyjs/v6/all-props/#placement
 *                       https://popper.js.org/docs/v2/modifiers/flip/
 */
function getTippyPlacements(isSwipe) {
    const graphOrientation = getGraphOrientation();
    let placements = {};
    if (graphOrientation === 'LR') {  // graph LR -> regular nodes left-to-right, swipes top-to-bottom
        if (!isSwipe) {
            // If possible, don't cover next/previous nodes on the same timeline. (top/bottom, try all alignments)
            // Then prefer to cover previous nodes (left), and finally, next nodes (right).
            // https://atomiks.github.io/tippyjs/#placements
            placements.preferred = 'top';
            placements.fallback = ['top-start', 'top-end', 'bottom', 'bottom-start', 'bottom-end', 'left', 'right'];
        } else {
            // If possible, don't cover other swipe nodes on the same message. (right/left, try all alignments)
            // Then prefer to cover previous swipes (top), and finally, next swipes (bottom).
            placements.preferred = 'right';  // don't cover other swipes
            placements.fallback = ['right-start', 'right-end', 'left', 'left-start', 'left-end', 'top', 'bottom'];
        }
    } else {  // graph TB -> regular nodes top-to-bottom, swipes left-to-right
        if (!isSwipe) {
            placements.preferred = 'left';
            placements.fallback = ['left-start', 'left-end', 'right', 'right-start', 'right-end', 'top', 'bottom'];
        } else {
            placements.preferred = 'bottom';
            placements.fallback = ['bottom-start', 'bottom-end', 'top', 'top-start', 'top-end', 'left', 'right'];
        }
    }
    return placements;
}

/**
 * Creates a Tippy tooltip for a given Cytoscape element with specified content.
 *
 * @param {Object} ele - The Cytoscape element (node/edge) to attach the tooltip to.
 * @param {string} text - The content to be displayed inside the tooltip.
 * @returns {Object} - Returns the Tippy tooltip instance.
 */
function makeTippy(ele, text) {
    const ref = getTooltipReference(ele);
    const isSwipe = Boolean(ele.data('isSwipe'));
    const placements = getTippyPlacements(isSwipe);

    const dummyDomEle = document.createElement('div');

    const tip = tippy(dummyDomEle, {
        getReferenceClientRect: ref,
        trigger: 'mouseenter',
        delay: [1000, 1000], // 0ms delay for both show and hide
        duration: 0, // No animation duration
        content: function () {
            var div = document.createElement('div');
            div.innerHTML = text;
            return div;
        },
        arrow: true,
        placement: extension_settings.timeline.fixedTooltip ? 'top-start' : placements.preferred,
        hideOnClick: true,
        sticky: 'reference',
        interactive: true,
        appendTo: document.body,
    });

    return tip;
}

/**
 * Formats a message for display within a node, handling special characters and Markdown conversion.
 *
 * @param {string} mes - The message to be formatted.
 * @returns {string} - The formatted message.
 *
 * Steps:
 * 1. Convert null messages to empty strings.
 * 2. Fix markdown-related content.
 * 3. Convert special characters to HTML entities.
 * 4. Format quotations and code snippets.
 * 5. Handle mathematical notation by converting LaTeX align environments to display math mode.
 * 6. Convert the message from markdown to HTML.
 * 7. Handle newlines and special characters within <code> tags.
 */

function formatNodeMessage(mes) {
    if (mes == null) return '';
    mes = fixMarkdown(mes);
    mes = mes.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    mes = mes.replace(/```[\s\S]*?```|``[\s\S]*?``|`[\s\S]*?`|(\".+?\")|(\u201C.+?\u201D)/gm, function (match, p1, p2) {
        if (p1) {
            return '<q>' + p1.replace(/\"/g, '') + '</q>';
        } else if (p2) {
            return '<q>“' + p2.replace(/\u201C|\u201D/g, '') + '”</q>';
        } else {
            return match;
        }
    });

    // 5. Handling mathematical notation
    mes = mes.replaceAll('\\begin{align*}', '$$').replaceAll('\\end{align*}', '$$');

    let converter = new showdown.Converter({
        emoji: 'true',
        literalMidWordUnderscores: 'true',
        parseImgDimensions: 'true',
        tables: 'true',
    });

    mes = converter.makeHtml(mes);

    // 7. Handle <code> tags
    // TODO: Does this ever trigger? We replace < > a the beginning with HTML entities.
    // TODO: Is the opening tag matcher correct? If there are multiple `<code>...</code>` sections in the message, and the capture is greedy...
    mes = mes.replace(/<code(.*)>[\s\S]*?<\/code>/g, function (match) {
        return match.replace(/\n/gm, '\u0000');
    });
    mes = mes.replace(/\n/g, '<br/>');
    mes = mes.replace(/\u0000/g, '\n');
    mes = mes.trim();
    mes = mes.replace(/<code(.*)>[\s\S]*?<\/code>/g, function (match) {
        return match.replace(/&amp;/g, '&');
    });

    return mes;
}

/**
 * Creates a Tippy tooltip for a given Cytoscape element (node/edge) upon tapping.
 *
 * @param {Object} ele - The Cytoscape element (node/edge) for which the tooltip is being created.
 * @returns {Object} - The Tippy tooltip instance.
 *
 * The tooltip displays:
 * - Node name and send date.
 * - Swipes count, if any.
 * - Message content formatted using the `formatNodeMessage` function.
 * - A list of chat sessions associated with the node, with buttons to navigate to a session or branch from it.
 *
 * The tooltip's position, behavior, and style are also configured in this function.
 */

function makeTapTippy(ele) {
    const ref = getTooltipReference(ele);
    const isSwipe = Boolean(ele.data('isSwipe'));
    const placements = getTippyPlacements(isSwipe);

    const dummyDomEle = document.createElement('div');

    const tip = tippy(dummyDomEle, {
        getReferenceClientRect: ref,
        trigger: 'manual',
        duration: 0,
        content: function () {
            const div = document.createElement('div');
            div.classList.add('tap_tippy_content');

            // Set up the heading section
            const dataItems = [
                { content: ele.data('name'), className: 'name_text' },
                { content: ele.data('send_date'), className: 'timestamp' },
            ];
            if (ele.data('totalSwipes') > 0) {
                dataItems.push({ content: `Swipes: ${ele.data('totalSwipes')}`, className: 'timestamp' });
            }

            // Build the HTML

            // Heading section
            dataItems.forEach(dataItem => {
                let p = document.createElement('div');
                p.classList.add(dataItem.className);
                p.innerHTML = dataItem.content;
                div.appendChild(p);
            });

            // --------------------------------------------------------------------------------
            div.appendChild(document.createElement('hr'));

            // Add buttons: navigate to the message, create a new branch at the message
            const menuDiv = document.createElement('div');
            menuDiv.classList.add('menu_div');
            if (ele.data('chat_sessions')) {
                for (const [file_name, session_metadata] of Object.entries(ele.data('chat_sessions'))) {
                    // Create a container for the buttons
                    const btnContainer = document.createElement('div');
                    btnContainer.style.display = 'flex';
                    btnContainer.style.alignItems = 'center'; // To vertically center the buttons

                    const sessionName = file_name.split('.jsonl')[0];
                    const messageId = session_metadata.messageId;  // sequential message number in chat
                    // Without creating a branch, swipes are available only at the last message of a chat.
                    const canNavigateToSwipe = (messageId === (session_metadata.length - 1));

                    // 1. Create the main button
                    const navigateBtn = document.createElement('button');
                    navigateBtn.classList.add('menu_button');
                    navigateBtn.textContent = sessionName;
                    navigateBtn.title = `Find and open this message in "${sessionName}".`;  // TODO: data-i18n?
                    if (Boolean(ele.data('isSwipe')) && !canNavigateToSwipe) {
                        navigateBtn.disabled = true;
                        navigateBtn.classList.add('disabled');
                    }
                    navigateBtn.addEventListener('click', function () {
                        if (ele.data('isSwipe')) {
                            navigateToMessage(file_name, messageId, ele.data('swipeId'));
                        } else {
                            navigateToMessage(file_name, messageId);
                        }
                        closeModal();
                        tip.hide(); // Hide the Tippy tooltip
                    });
                    btnContainer.appendChild(navigateBtn);

                    // 2. Create the branch button (arrow to the right)
                    const branchBtn = document.createElement('button');
                    branchBtn.classList.add('branch_button'); // You might want to style this button differently in your CSS
                    branchBtn.textContent = '→'; // Arrow to the right
                    branchBtn.classList.add('menu_button');
                    branchBtn.classList.add('widthNatural');
                    // add title to branch button
                    branchBtn.title = `Create a new branch from "${sessionName}", at this message, and open it.`;  // TODO: data-i18n?
                    branchBtn.addEventListener('click', function () {
                        if(ele.data('isSwipe'))
                            navigateToMessage(file_name, messageId, ele.data('swipeId'), true);
                        else
                            navigateToMessage(file_name, messageId, null, true);
                        closeModal();
                        tip.hide(); // Hide the Tippy tooltip
                    });
                    btnContainer.appendChild(branchBtn);

                    // Append the container to the menuDiv
                    menuDiv.appendChild(btnContainer);
                }
            }
            div.appendChild(menuDiv);

            // --------------------------------------------------------------------------------
            div.appendChild(document.createElement('hr'));

            // Add the message content.
            const mesDiv = document.createElement('div');
            mesDiv.classList.add('mes_text');
            mesDiv.innerHTML = formatNodeMessage(ele.data('msg'));
            div.appendChild(mesDiv);

            return div;
        },
        arrow: true,
        placement: extension_settings.timeline.fixedTooltip ? 'top-start' : placements.preferred,
        hideOnClick: false,
        sticky: 'reference',
        interactive: true,
        appendTo: document.body,
        boundary: document.querySelector('#timelinesDiagramDiv'),
        onShow() {
            isTapTippyActive = true;
        },
        onHide() {
            isTapTippyActive = false;
            console.debug('Tap Tippy hidden');
        },
        popperOptions: {
            modifiers: [
                {
                    name: 'preventOverflow',
                    options: {
                        boundary: document.querySelector('#timelinesDiagramDiv'),
                    },
                },
                {
                    name: 'flip',
                    options: {
                        boundary: document.querySelector('#timelinesDiagramDiv'),
                        fallbackPlacements: placements.fallback,
                    },
                },
                {
                    name: 'computeStyles',
                    options: {
                        adaptive: true,
                        gpuAcceleration: extension_settings.timeline.gpuAcceleration,
                        zIndex: 9999,
                    },
                },
            ],
        },
    });

    return tip;
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
 *    - If an edge with a unique color is found, its details (checkpoint name and color)
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
        let color = node.style('background-color');

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
        const differentLegendItemClicked = Boolean(currentlyHighlighted !== selector);

        resetLegendHighlight(cy);

        if (differentLegendItemClicked) {
            highlightElements(cy, selector);
            legendItem.classList.add('active-legend');
            currentlyHighlighted = selector;

            // Zoom to the highlighted elements
            const [eles, padding] = filterElementsAndPad(cy, currentlyHighlighted);
            cy.stop().animate({fit: { eles: eles, padding: padding },
                               duration: 300});
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
    if (item.text.includes(' - ')) {  // Omit the chat file timestamp, but keep the rest.
        legendText.innerText = item.text.split(' - ').slice(0, -1).join(' - ');
    } else {
        legendText.innerText = item.text;
    }

    legendItem.appendChild(legendSymbol);
    legendItem.appendChild(legendText);

    container.appendChild(legendItem);
}

/**
 * Resets the legend highlight (from clicking on a legend item).
 *
 * @param {Object} cy - The Cytoscape instance where graph operations are performed.
 */
function resetLegendHighlight(cy)
{
    if (currentlyHighlighted) {
        restoreElements(cy);
        const activeItems = document.querySelectorAll('.active-legend');
        activeItems.forEach(item => item.classList.remove('active-legend'));
        currentlyHighlighted = null;
    }
}

/**
 * Selects elements for zooming to fit, and calculates padding.
 * This is the higher-level function that uses `calculateFitZoom`, which see.
 *
 * Leaves one node size of padding if zoomed in (= 100% or closer), and 20px otherwise.
 *
 * @param {Object} cy - The Cytoscape instance.
 * @param {Object} selector - Anything `cy.filter` accepts. The thing(s) being zoomed to fit.
 *                            Use `undefined` to select the whole graph.
 */
function filterElementsAndPad(cy, selector) {
    let padding = 20;
    let eles = cy.filter(selector);
    if (eles.length > 0) {
        const zoomToFit = calculateFitZoom(cy, eles);
        if (zoomToFit >= 1.0) {
            padding = zoomToFit * extension_settings.timeline.nodeWidth;
        }
    } else {
        eles = cy.filter();  // zoom out (select all elements) if the selector didn't match
    }
    return [eles, padding]
}

/**
 * Calculates the zoom level needed to exactly fit the specified thing to the Cytoscape viewport.
 *
 * This can be used as an adapter for computing padding sizes in *model* pixels when zooming to fit
 * in Cytoscape, because the 'fit' operations only accept padding sizes in *rendered* pixels.
 *
 * @param {Object} cy - The Cytoscape instance.
 * @param {Object} eles - Result from `cy.filter`. The thing(s) being zoomed to fit.
 *                        We require calling `cy.filter` manually so that `eles` can be re-used
 *                        in the actual zooming call.
 * @returns {number} Returns the zoom-to-fit zoom level as a number.
 */
function calculateFitZoom(cy, eles) {
    const bb = eles.boundingBox();
    const view_w = cy.width();
    const view_h = cy.height();
    const zoomToFit_w = view_w / bb.w;
    const zoomToFit_h = view_h / bb.h;
    const zoomToFit = Math.min(zoomToFit_w, zoomToFit_h);
    return zoomToFit;
}

/**
 * Initializes a Cytoscape instance with given node data and styles.
 *
 * This function does the following:
 * 1. Locates the container element 'timelinesDiagramDiv' for the Cytoscape graph.
 * 2. Registers the necessary plugins: 'cytoscapeDagre', 'cytoscapeContextMenus', and 'cytoscapePopper'.
 * 3. Creates and configures the Cytoscape instance with the provided node data, styles, and layout settings.
 * 4. Adjusts wheel sensitivity for zooming operations on the graph.
 *
 * @param {Array<Object>} nodeData - Array of node data objects containing information required to render nodes and edges.
 * @param {Array<Object>} styles - Array of style definitions for nodes, edges, and other graph elements.
 * @returns {Object|null} Returns the Cytoscape instance if initialization is successful, otherwise returns null.
 */
function initializeCytoscape(nodeData, styles) {
    let timelinesDiagramDiv = document.getElementById('timelinesDiagramDiv');
    if (!timelinesDiagramDiv) {
        console.error('Unable to find element with id "timelinesDiagramDiv". Please ensure the element exists at the time of calling this function.');
        return null;
    }

    cytoscape.use(cytoscapeDagre);
    cytoscape.use(cytoscapeContextMenus);
    cytoscape.use(cytoscapePopper);

    const cy = cytoscape({
        container: timelinesDiagramDiv,
        elements: nodeData,
        style: styles,
        layout: layout,
        wheelSensitivity: 0.2,  // Adjust as needed.
    });

    return cy;
}

/**
 * Gets the client bounding rectangle of the element with the id 'fixedReference'.
 *
 * @returns {DOMRect} - The client bounding rectangle of the specified element.
 */
function getFixedReferenceClientRect() {
    return document.querySelector('#fixedReference').getBoundingClientRect();
}

/**
 * Determines the reference position for the tooltip based on the configuration settings.
 *
 * @param {Object} ele - The Cytoscape element (node/edge) for which the tooltip reference is being determined.
 * @returns {Function} - A function returning the client bounding rectangle of the reference element.
 *
 * If the fixedTooltip setting is enabled, the reference is the bottom-left corner of the screen;
 * otherwise, it is the position of the provided Cytoscape element.
 */
function getTooltipReference(ele) {
    if (extension_settings.timeline.fixedTooltip) {
        // TODO: No idea why we need to wrap this into a function instead of just returning the bound method itself
        //       (maybe the query selector instance gets GC'd too early?), but there you have it.
        return getFixedReferenceClientRect;  // Reference: zero-size div fixed at the bottom-left corner (see `timeline.html`)
    } else {
        return ele.popperRef().getBoundingClientRect;  // Node's position
    }
}

/**
 * Toggles the display of swipe nodes in the Cytoscape graph.
 *
 * @param {Object} cy - The Cytoscape instance.
 * @param {Boolean} visible - Optional; if given, set the swipe node visible state instead of toggling it.
 *
 * When showing, swipe nodes are added to the graph using the stored data in the parent nodes.
 * When hiding, swipe nodes are removed along with their connected edges.
 */

function toggleSwipes(cy, visible) {
    // Check if there's any swipe node in the graph
    const swipeNodes = cy.nodes('[?isSwipe]');
    const wasVisible = Boolean(swipeNodes.length > 0);

    if (wasVisible) {  // Remove all old swipe nodes and edges, if any
        swipeNodes.connectedEdges().remove();
        swipeNodes.remove();
    }

    if (visible === undefined) {  // New `visible` state not specified, toggle
        visible = !wasVisible;
    }

    if (visible) {
        cy.nodes().forEach(node => {
            const storedSwipes = node.data('storedSwipes');
            if (storedSwipes && storedSwipes.length > 0) {
                storedSwipes.forEach(({ node: swipeNode, edge: swipeEdge }) => {
                    cy.add({ group: 'nodes', data: swipeNode });
                    cy.add({ group: 'edges', data: swipeEdge });
                });
            }
        });
    }
}

/**
 * Sets up event handlers for the given Cytoscape instance and node data.
 *
 * This function does the following:
 * 1. Attaches an event listener to the 'input' event of the search field to enable node highlighting based on search query.
 * 2. Adds an event listener to handle node clicks, triggering actions like node navigation.
 * 3. Configures the graph's orientation based on the viewport dimensions.
 * 4. Implements a delay for displaying tooltips on node hover, showcasing truncated node messages.
 *
 * @param {Object} cy - The Cytoscape instance for which the event handlers are being set up.
 * @param {Array<Object>} nodeData - Array of node data objects containing information like chat sessions.
 */
function setupEventHandlers(cy, nodeData) {
    let showTimeout;
    let activeTapTippy = null;

    document.getElementById('transparent-search').addEventListener('input', function (evt) {  // apply the search
        // // `evt.target === mainSearch`, so this is a no-op.
        // const mainSearch = document.getElementById('transparent-search');
        // mainSearch.value = evt.target.value;

        // We will now zoom to the search results, so remove the legend highlight, if any.
        resetLegendHighlight(cy);

        const query = evt.target.value.toLowerCase();
        const selector = highlightNodesByQuery(cy, query);  // -> selector function, or undefined if no match

        // Zoom to the matched elements (or zoom out if none)
        const [eles, padding] = filterElementsAndPad(cy, selector);
        cy.stop().animate({fit: { eles: eles, padding: padding },
                           duration: 300});
    });

    let modal = document.getElementById('timelinesModal');
    let rotateBtn = modal.getElementsByClassName('rotate')[0];
    rotateBtn.onclick = function () {
        toggleGraphOrientation(cy, layout);
        //refresh the layout
        refreshLayout();
        const [eles, padding] = filterElementsAndPad(cy, undefined);
        cy.stop().animate({fit: { eles: eles, padding: padding },
                           duration: 300});
    };

    let expandBtn = modal.getElementsByClassName('expand')[0];
    expandBtn.onclick = function () {
        toggleSwipes(cy);
        refreshLayout();
    };

    let reloadBtn = modal.getElementsByClassName('reload')[0];
    reloadBtn.onclick = function () {
        slashCommandHandler(null, 'r');  // r = reload
        refreshLayout();
    };

    let zoomtofitBtn = modal.getElementsByClassName('zoomtofit')[0];
    zoomtofitBtn.onclick = function () {
        const [eles, padding] = filterElementsAndPad(cy, undefined);
        cy.stop().animate({fit: { eles: eles, padding: padding },
                           duration: 300});
    };

    let zoomtocurrentBtn = modal.getElementsByClassName('zoomtocurrent')[0];
    zoomtocurrentBtn.onclick = function () {
        zoomToCurrentChatNode(cy);
    };

    cy.ready(function () {
        if (extension_settings.timeline.showLegend) {
            createLegend(cy);
            document.getElementById('legendDiv').style.display = 'block';
        }
        else {
            document.getElementById('legendDiv').style.display = 'none';
        }
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
        cy.on('tap', function (evt) {
            if (evt.target === cy) {
                tipInstance.hide();
            }
        });
    });

    // Handle double click on nodes for quickly navigating to the message
    cy.on('dbltap ', 'node', function (evt) {
        const node = evt.target;

        // Auto-pick first chat file that has this message
        const chat_sessions = Object.entries(node.data('chat_sessions'));
        const [file_name, session_metadata] = chat_sessions[0];
        const messageId = session_metadata.messageId;

        // If ambiguous, show which session was selected
        if (chat_sessions.length > 1) {
            toastr.info(`Multiple matches, auto-picked "${file_name}"`);
        }

        if (node.data('isSwipe')) {
            // NOTE: This will automatically create a branch if the swipe is on a non-last message.
            //       "Avoid creating a branch *when possible*" is arguably the right behavior for the quick shortcut.
            navigateToMessage(file_name, messageId, node.data('swipeId'));
        } else {
            navigateToMessage(file_name, messageId);
        }
        closeModal();
        activeTapTippy.hide();
    });

    function refreshLayout() {
        layout.fit = false;
        const cyLayout = cy.elements().makeLayout(layout);

        cy.nodes().forEach(node => { node.unlock(); });
        cyLayout.run();  // apply the layout
        cy.nodes().forEach(node => { node.lock(); });
    }

    cy.on('taphold', 'node', function (evt) {
        let node = evt.target;
        let nodeId = node.id();

        // Check if the node has the storedSwipes attribute
        if (node.data('storedSwipes')) {
            console.debug(node.data('storedSwipes'));
            // Determine if the swipes are already added to the graph
            const firstSwipeId = node.data('storedSwipes')[0].node.id;
            const swipeExists = cy.getElementById(firstSwipeId).length > 0;

            if (!swipeExists) {
                // For this node, add stored swipes and their edges to the graph
                node.data('storedSwipes').forEach(({ node: swipeNode, edge: swipeEdge }) => {
                    // increase the edge weight
                    swipeEdge.weight = 100;
                    cy.add({ group: 'nodes', data: swipeNode });
                    cy.add({ group: 'edges', data: swipeEdge });
                });
            } else {
                // For this node, remove stored swipes and their edges from the graph
                node.data('storedSwipes').forEach(({ node: swipeNode }) => {
                    cy.getElementById(swipeNode.id).remove();
                });
            }

            refreshLayout();
        }
    });

    let hasSetOrientation = false;  // A flag to ensure we set the orientation only once

    cy.on('render', function () {
        if (!hasSetOrientation) {
            hasSetOrientation = true;
            setGraphOrientationBasedOnViewport(cy, layout);
            cy.nodes().forEach(node => { node.lock(); });  // nodes are always locked after running the layout anyway
        }
    });

    const truncateMessage = (msg, length = 100) => {
        if (msg === undefined) {
            return '';
        }
        return msg.length > length ? msg.substr(0, length - 3) + '...' : msg;
    };

    // TODO: Figure out how to do the delay better later
    cy.on('mouseover', 'node', function (evt) {
        if (isTapTippyActive) {
            return;  // Return early if tap Tippy is active
        }

        let node = evt.target;
        let truncatedMsg = truncateMessage(node.data('msg'));
        let content = node.data('name') ? `${node.data('name')}: ${truncatedMsg}` : truncatedMsg;

        // Delay the tooltip appearance by 250 ms
        showTimeout = setTimeout(() => {
            let tippy = makeTippy(node, content);
            tippy.show();
            node._tippy = tippy;  // Store the tippy instance on the node
        }, 250);
    });


    cy.on('mouseout', 'node', function (evt) {
        let node = evt.target;

        // Clear the timeout if the mouse is moved out before the tooltip appears
        if (showTimeout) {
            clearTimeout(showTimeout);
        }

        if (node._tippy) {
            node._tippy.hide();
        }
    });
    // if user_message_rendered or character_message_rendered, we null the lastContext (so that the graph refreshes at the next `updateTimelineDataIfNeeded`)
    // TODO: Are there other events we should catch?
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        lastContext = null;
    },
    );
    eventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
        lastContext = null;
    },
    );
    eventSource.on(event_types.CHAT_DELETED, () => {
        lastContext = null;
    },
    );
    eventSource.on(event_types.CHATLOADED, () => {  // TODO: this seems wrong, no such constant?
        lastContext = null;
    },
    );
    eventSource.on(event_types.MESSAGE_SWIPED, () => {
        lastContext = null;
    },
    );
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
    if (extension_settings.timeline.enableMinZoom) {
        cy.minZoom(Number(extension_settings.timeline.minZoom));
    }
    if (extension_settings.timeline.enableMaxZoom) {
        cy.maxZoom(Number(extension_settings.timeline.maxZoom));
    }
    theCy = cy;

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

        if (!context.characterId) {  // group chat
            let groupID = context.groupId;
            if (groupID) {
                // Send the group where the ID within the dict is equal to groupID
                let group = context.groups.find(group => group.id === groupID);
                // For each `group.chats`, we add to a dict with the key being the index and the value being the chat
                for(let i = 0; i < group.chats.length; i++){
                    console.debug(group.chats[i]);
                    data[i] = { 'file_name': group.chats[i] };
                }
                lastTimelineData = await prepareData(data, true);
            }
        }
        else {
            data = await fetchData(context.characters[context.characterId].avatar);
            lastTimelineData = await prepareData(data);
        }

        lastContext = context; // Update `lastContext` to the current context
        console.info('Timeline data updated');
        layout = {
            name: 'dagre',
            nodeDimensionsIncludeLabels: true,
            nodeSep: extension_settings.timeline.nodeSeparation,
            edgeSep: extension_settings.timeline.edgeSeparation,
            rankSep: extension_settings.timeline.rankSeparation,
            rankDir: 'LR',  // Left to Right
            ranker: 'network-simplex',  // 'network-simplex', 'tight-tree' or 'longest-path
            spacingFactor: extension_settings.timeline.spacingFactor,
            acyclicer: 'greedy',
            align: extension_settings.timeline.align,
        };
        return true; // Data was updated
    }
    return false; // No update occurred
}

/**
 * Centers and zooms to the chat node containing the current chat message.
 *
 * @param {Object} cy - The Cytoscape instance.
 */
function zoomToCurrentChatNode(cy) {
    // Get latest chat message in currently open chat (TODO: special considerations for group chats?)
    const context = getContext();
    const chat = context.chat;
    const lastMessageId = chat.length - 1;
    const lastMessageObj = chat[lastMessageId];
    const mes = lastMessageObj.mes;

    // On the graph, find the node containing that message text.
    const selector = function (ele) { return ele.data('msg') === mes };
    const newCenterNode = cy.filter(selector);
    resetLegendHighlight(cy);

    // Center and zoom in
    cy.stop().animate({
        center: { eles: newCenterNode },
        zoom: Number(extension_settings.timeline.zoomToCurrentChatZoom),
        duration: 300,  // Adjust the duration as needed for a smooth transition
    });

    // Draw the user's attention to the node
    function flashNode(node, howManyFlashes) {
        const duration = 500;  // half-period
        node.flashClass('NoticeMe', duration);  // do the first flash now
        for (let j = 1; j < howManyFlashes; j++) {  // schedule the rest
            setTimeout(() => { node.flashClass('NoticeMe', duration); },
                       2 * j * duration);
        }
    }
    flashNode(newCenterNode, 4);
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
    handleModalDisplay();  // Show the timeline view, and wire the close button to close it.
    if (dataUpdated) {
        renderCytoscapeDiagram(lastTimelineData);  // after this, the Cytoscape instance `theCy` is alive
        toggleSwipes(theCy, extension_settings.timeline.autoExpandSwipes);
    }
    closeOpenDrawers();

    // Let the window layout settle itself for 500 ms before trying to zoom
    // (this avoids some failed pans/zooms).
    setTimeout(() => {
        zoomToCurrentChatNode(theCy);

        let searchElement = document.getElementById('transparent-search');
        searchElement.focus();
        searchElement.select();  // select content for easy erasing
        // searchElement.dispatchEvent(new Event('input'));  // apply the search (maybe not - we're already zooming to the current chat)
    }, 500);
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
    $('#extensions_settings').append(settingsHtml);
    $('#show_timeline_view').on('click', onTimelineButtonClick);
    registerSlashCommand('tl', slashCommandHandler, [], '/tl Show the timeline, "/tl r" to reload the graph', false, true);

    // Bind listeners to the specific inputs; format: {html_ui_id: name_in_default_settings, ...}
    const idsToSettingsMap = {
        'tl_node_width': 'nodeWidth',
        'tl_node_height': 'nodeHeight',
        'tl_node_separation': 'nodeSeparation',
        'tl_edge_separation': 'edgeSeparation',
        'tl_rank_separation': 'rankSeparation',
        'tl_spacing_factor': 'spacingFactor',
        'tl_tooltip_fixed': 'fixedTooltip',
        'tl_gpu_acceleration': 'gpuAcceleration',
        'tl_align': 'align',
        'tl_node_shape': 'nodeShape',
        'tl_curve_style': 'curveStyle',
        'tl_swipe_scale': 'swipeScale',
        'tl_avatar_as_root': 'avatarAsRoot',
        'tl_show_legend': 'showLegend',
        'tl_use_chat_colors': 'useChatColors',
        'tl_auto_expand_swipes': 'autoExpandSwipes',
        'tl_zoom_current_chat': 'zoomToCurrentChatZoom',
        'tl_zoom_min_cb': 'enableMinZoom',
        'tl_zoom_min': 'minZoom',
        'tl_zoom_max_cb': 'enableMaxZoom',
        'tl_zoom_max': 'maxZoom',
        'bookmark-color-picker': 'bookmarkColor',
        'edge-color-picker': 'edgeColor',
        'user-node-color-picker': 'userNodeColor',
        'char-node-color-picker': 'charNodeColor',
    };

    for (let [id, settingName] of Object.entries(idsToSettingsMap)) {
        if (id.includes('color-picker')) {  // or a more specific way to identify color pickers if needed
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
        $('#toggleStyleSettings').click(function () {
            $('#styleSettingsArea').toggleClass('hidden');
        });
        $('#toggleColorSettings').click(function () {
            $('#colorSettingsArea').toggleClass('hidden');
        });
    });

    $('#resetSettingsBtn').click(function () {
        extension_settings.timeline = Object.assign({}, defaultSettings);
        loadSettings();
        saveSettingsDebounced();
    });

    $(document).on('keydown', function (event) {
        processTimelinesHotkeys(event.originalEvent);
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
    // Get new value from the GUI element
    let value;
    if (element.is(':checkbox')) {
        value = element.prop('checked');
    }
    else if (element.is('toolcool-color-picker')) {
        value = rgbaValue;
    }
    else {
        value = element.val();
    }

    const elementId = element.attr('id');

    // Enforce consistency between the various zoom settings
    let otherSetting = undefined;  // for triggering a linked change on one other setting
    if (elementId.includes('_zoom_')) {
        // enable/disable min/max sliders based on checkbox state
        if (elementId === 'tl_zoom_min_cb') {
            const enabled = Boolean(value);
            $('#tl_zoom_min').prop("disabled", !enabled);
            // `.addClass('disabled')` / `.removeClass('disabled')` doesn't change the visual appearance of a slider, so we don't bother.

            // When the min is suddenly enabled, change the min to the zoomToCurrentChatZoom, if it is currently larger.
            // This is better than changing zoomToCurrentChatZoom, because that was already enabled, but the min wasn't.
            if (enabled && (Number(extension_settings.timeline.minZoom) > Number(extension_settings.timeline.zoomToCurrentChatZoom))) {
                otherSetting = $('#tl_zoom_min');
                otherSetting.val(extension_settings.timeline.zoomToCurrentChatZoom);  // clamp *the other setting*
            }
        }
        if (elementId === 'tl_zoom_max_cb') {
            const enabled = Boolean(value);
            $('#tl_zoom_max').prop("disabled", !enabled);

            if (enabled && (Number(extension_settings.timeline.maxZoom) < Number(extension_settings.timeline.zoomToCurrentChatZoom))) {
                otherSetting = $('#tl_zoom_max');
                otherSetting.val(extension_settings.timeline.zoomToCurrentChatZoom);  // clamp *the other setting*
            }
        }

        if (elementId === 'tl_zoom_current_chat') {  // clamp to [min, max] when min/max enabled
            if (extension_settings.timeline.enableMinZoom && (Number(value) < Number(extension_settings.timeline.minZoom))) {
                value = extension_settings.timeline.minZoom;
                $('#tl_zoom_current_chat').val(value);  // send clamped value back to GUI
            }
            if (extension_settings.timeline.enableMaxZoom && (Number(value) > Number(extension_settings.timeline.maxZoom))) {
                value = extension_settings.timeline.maxZoom;
                $('#tl_zoom_current_chat').val(value);  // send clamped value back to GUI
            }
        }

        if (elementId === 'tl_zoom_min') {  // clamp to max; change zoomToCurrentChatZoom if changing min would make it smaller than new min
            if (extension_settings.timeline.enableMaxZoom && (Number(value) > Number(extension_settings.timeline.maxZoom))) {
                value = extension_settings.timeline.maxZoom;
                $('#tl_zoom_min').val(value);  // send clamped value back to GUI
            }
            if (Number(value) > Number(extension_settings.timeline.zoomToCurrentChatZoom)) {
                otherSetting = $('#tl_zoom_current_chat');
                otherSetting.val(value);  // clamp *the other setting*
            }
        }
        if (elementId === 'tl_zoom_max') {  // clamp to min; change zoomToCurrentChatZoom if changing max would make it larger than new max
            if (extension_settings.timeline.enableMinZoom && (Number(value) < Number(extension_settings.timeline.minZoom))) {
                value = extension_settings.timeline.minZoom;
                $('#tl_zoom_max').val(value);  // send clamped value back to GUI
            }
            if (Number(value) < Number(extension_settings.timeline.zoomToCurrentChatZoom)) {
                otherSetting = $('#tl_zoom_current_chat');
                otherSetting.val(value);  // clamp *the other setting*
            }
        }
    }

    // Only update the `..._value` label in the GUI if the value is numeric
    if (!isNaN(value)) {
        const isFloat = element.hasClass('floatingpoint');
        let displayValue = value;
        if (!isFloat) {  // round to integer unless tagged as a float
            displayValue = Math.round(value);
        }
        $(`#${elementId}_value`).text(displayValue);
    }

    // Update the actual setting
    extension_settings.timeline[settingName] = value;
    lastContext = null; // Invalidate the last context to force a data update

    // If changing this setting triggered a linked update on another setting, process it now.
    // We must do this *after* updating the actual settings object, so that one debounced save
    // saves the new value of both settings.
    if (otherSetting) {
        otherSetting.trigger('input');
    }

    saveSettingsDebounced();
}

/**
 * Processes hotkeys for the Timelines extension.
 *
 * @param {KeyboardEvent} event - The keyboard event.
 */
function processTimelinesHotkeys(event) {
    // Only handle hotkeys when the timeline view is open
    let modal = document.getElementById('timelinesModal');
    if (modal.style.display === 'none') {
        return;
    }

    // TODO: There's already a keydown handler on the document, from `RossAscends-mods.js`.
    // The issue is that it has already triggered when we get here - so things like pressing
    // arrow keys will cause swipes, although the main GUI is covered by the Timelines modal.
    // This isn't a problem when the search field is focused; it understands arrow keys correctly.
    // It's just that when the focus is elsewhere, arrow keys fall through.
    // The alternative solution of attaching our handler to the modal (instead of to the document)
    // fails to register keypresses.
    //
    // What this does is prevent the event from falling through any further while the modal is open.
    event.stopImmediatePropagation();

    // console.log(event);  // debug/development

    if (event.ctrlKey && event.shiftKey && event.key === 'F') {  // A bare "Ctrl+F" would also trigger the browser's search field
        const searchElement = document.getElementById('transparent-search');
        searchElement.focus();
        searchElement.select();  // select content for easy erasing
    }

    if (event.key === 'Escape') {
        closeModal();
        closeTippy();
    }
}
