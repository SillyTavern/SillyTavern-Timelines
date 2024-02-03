import { highlightElements, restoreElements } from './tl_style.js';

let currentOrientation = 'TB';  // starting orientation

/**
 * Toggles the orientation of the graph between Left-to-Right (LR) and Top-to-Bottom (TB).
 *
 * @param {Object} cy - The Cytoscape instance representing the graph.
 * @param {Object} layout - The Cytoscape layout configuration object.
 */
export function toggleGraphOrientation(cy, layout) {
    currentOrientation = (currentOrientation === 'LR') ? 'TB' : 'LR';
    setOrientation(cy, currentOrientation, layout);
}

/**
 * Sets the graph orientation based on the current viewport size.
 * Chooses Left-to-Right (LR) orientation if the viewport width is greater than its height,
 * otherwise selects Top-to-Bottom (TB).
 *
 * @param {Object} cy - The Cytoscape instance representing the graph.
 * @param {Object} layout - The Cytoscape layout configuration object.
 */
export function setGraphOrientationBasedOnViewport(cy, layout) {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;

    const orientation = (viewportWidth > viewportHeight) ? 'LR' : 'TB';
    setOrientation(cy, orientation, layout);
}

/**
 * Returns the current orientation of the graph.
 *
 * @returns {string} 'TB' (top to bottom) or 'LR' (left to right).
 */
export function getGraphOrientation() {
    return currentOrientation;
}

/**
 * Sets the orientation of the graph to the specified direction (either 'LR' for Left-to-Right
 * or 'TB' for Top-to-Bottom).
 *
 * @param {Object} cy - The Cytoscape instance representing the graph.
 * @param {string} orientation - The desired orientation for the graph ('LR' or 'TB').
 * @param {Object} layout - The Cytoscape layout configuration object.
 * @private
 */
function setOrientation(cy, orientation, layout) {
    // Update layout
    layout.rankDir = orientation;
    cy.layout(layout).run();
    // Update taxi-direction in style
    const taxiDirection = orientation === 'TB' ? 'downward' : 'rightward';
    cy.style().selector('edge').style({
        'taxi-direction': taxiDirection,
    }).update();
    currentOrientation = orientation;
}

/**
 * Extracts unique fragments for fragment search from the query string.
 * A fragment is any whitespace-delimited part of `query`.
 *
 * If you only call `highlightNodesByQuery`, you don't need this function.
 * This is only needed when you want to do something else with the fragments,
 * e.g. if you want to use them to highlight matching parts in the results.
 *
 * @param {string} query - The text search query string.
 * @param {Boolesn} doLowerCase - Whether to lowercase the fragments.
 * @returns {Array} The fragment strings, in an array.
 */
export function makeQueryFragments(query, doLowerCase) {
    let fragments = query.trim().split(/\s+/).map( function (str) { return str.trim(); } );
    fragments = [...new Set(fragments)];  // uniques only
    // fragments = fragments.filter( function(str) { return str.length >= 3; } );  // Helm in Emacs does this, but perhaps better if we don't.
    if (doLowerCase) {
        fragments = fragments.map( function (str) { return str.toLowerCase(); } );
    }
    return fragments;
}

/**
 * Highlights nodes in the graph based on a provided query.
 * Nodes where the 'msg' property contains the query will be highlighted, while others will be dimmed.
 * If no nodes match the query or if the query is empty, all nodes will be restored to their original state.
 *
 * @param {Object} cy - The Cytoscape instance representing the graph.
 * @param {string} query - The query used to match and highlight nodes.
 * @param {string} searchMode - One of the following:
 *                                 'fragments': do a fragment search, like Helm in Emacs:
 *                                     The search string is split at whitespaces to produce *fragments*.
 *                                     Each fragment is a search term. The search matches if all fragments match,
 *                                     but their ordering does not matter.
 *
 *                                     E.g. the search "high que nod" will match the name of this function,
 *                                     "highlightNodesByQuery".
 *
 *                                     Fragment search tends cut down on user time spent to find the desired item.
 *
 *                                 'substring': do a classical substring search.
 *
 * @returns {function} The selector that was used to match and highlight nodes, built from the query,
 *                     or `undefined` if no match (so that you can e.g. pass this to `cy.filter` to select all).
 */
export function highlightNodesByQuery(cy, query, searchMode) {
    // Sanity check
    if (!(['fragments', 'substring']).includes(searchMode)) {
        throw new RangeError(`Timelines: unknown search mode '${searchMode}'; valid: 'fragments', 'substring'.`);
    }

    // If there's no query, restore elements to their original state.
    if (!query || query === '') {
        restoreElements(cy);
        return;
    }

    const queryLowerCase = query.toLowerCase();
    let fragments;
    if (searchMode === 'fragments') {
        fragments = makeQueryFragments(query, true);  // Lowercase the fragments just once, to speed up searching.
    }

    // https://github.com/Technologicat/js-for-pythonistas
    function all (predicate, iterable) {  // Same semantics as in Python.
        for (const x of iterable) {
            if (!predicate(x)) {
                return false;
            }
        }
        return true;
    }

    // const selector = `node[msg @*= "${query}"]`;  // classical substring search
    let selector;
    if (searchMode === 'fragments') {
        selector = function (ele) {  // use a function even in substring mode to be safe against special characters in `query`
            if (ele.group() !== 'nodes') {
                return false;
            }
            const msg = ele.data('msg');
            if (!msg) {
                return false;
            }
            const msgLowerCase = msg.toLowerCase();
            if (all(function (str) { return msgLowerCase.includes(str); },
                  fragments)) {
                return true;
            }
            return false;
        };
    } else {  // (searchMode === 'substring')
        selector = function (ele) {  // use a function even in substring mode to be safe against special characters in `query`
            if (ele.group() !== 'nodes') {
                return false;
            }
            const msg = ele.data('msg');
            if (msg && msg.toLowerCase().includes(queryLowerCase)) {
                return true;
            }
            return false;
        };
    }

    // If no nodes match the selector, restore elements.
    if (cy.elements(selector).length === 0) {
        restoreElements(cy);
        return undefined;
    }

    // Otherwise, highlight.
    restoreElements(cy);
    highlightElements(cy, selector);
    return selector;
}

/**
 * Retrieves the depth of a given node in a graph. The depth is determined based on the number of
 * ancestral nodes a node has, with the assumption that each node has at most one parent.
 *
 * @param {Object} node - The Cytoscape node object whose depth is to be determined.
 * @returns {number} The depth of the given node.
 */
export function getNodeDepth(node) {
    let depth = 0;
    while (node.incomers().nodes().length > 0) {
        node = node.incomers().nodes()[0];  // Assuming the node only has a single parent
        depth++;
    }
    return depth;
}
