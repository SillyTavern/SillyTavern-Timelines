import { characters, getRequestHeaders, openCharacterChat, saveSettingsDebounced, getThumbnailUrl } from "../../../../script.js";


/**
 * Navigate to a specific chat message in a chat session by adjusting the scroll position.
 *
 * @param {string} chatSessionName - Name of the chat session file (can include .jsonl extension).
 * @param {number} messageId - ID of the message to navigate to.
 * @returns {Promise<void>} Resolves once the navigation is complete.
 */
export async function navigateToMessage(chatSessionName, messageId) {

    //remove extension from file name
    chatSessionName = chatSessionName.replace('.jsonl', '');
    await openCharacterChat(chatSessionName);

    let message = $(`div[mesid=${messageId - 1}]`); // Select the message div by the messageId
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

/**
 * Closes any open drawers that are not pinned.
 * It also toggles the display icons and manages the animation during the transition.
 */
export function closeOpenDrawers() {
    var openDrawers = $('.openDrawer').not('.pinnedOpen');

    openDrawers.addClass('resizing').slideToggle(200, "swing", function () {
        $(this).closest('.drawer-content').removeClass('resizing');
    });

    $('.openIcon').toggleClass('closedIcon openIcon');
    openDrawers.toggleClass('closedDrawer openDrawer');
}

/**
 * Close the modal with ID "myModal".
 * It ensures the modal is returned to its original position in the DOM when closed.
 */
export function closeModal() {
    let modal = document.getElementById("myModal");

    if (!modal) {
        console.error('Modal not found!');
        return;
    }

    // Append the modal back to its original parent when closed
    document.querySelector('.timeline-view-settings_block').appendChild(modal);
    modal.style.display = "none";
}

/**
 * Manages the display state and behavior of the modal with ID "myModal".
 * - Appends the modal to the body and shows it when called.
 * - Appends the modal back to its original parent in the DOM when it's closed.
 * - Closes the modal either by clicking its close button or clicking outside of it.
 */
export function handleModalDisplay() {
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

    function closeTippy() {
        // If Tippy uses a specific class or attribute, you can target it more precisely
        let tippyBoxes = document.querySelectorAll('.tippy-box');

        tippyBoxes.forEach(box => {
            let parent = box.parentElement;
            if (parent && parent._tippy) {
                parent._tippy.hide();
            }
        });
    }


    closeBtn.onclick = function () {
        // Append the modal back to its original parent when closed
        document.querySelector('.timeline-view-settings_block').appendChild(modal);
        modal.style.display = "none";
        closeTippy();  // Hide the Tippy tooltip
    }

    window.onclick = function (event) {
        if (event.target == modal) {
            // Append the modal back to its original parent when clicked outside
            document.querySelector('.timeline-view-settings_block').appendChild(modal);
            modal.style.display = "none";
            closeTippy();  // Hide the Tippy tooltip
        }
    }

    // Append the modal to the body when showing it
    document.body.appendChild(modal);
    modal.style.display = "block";
}
