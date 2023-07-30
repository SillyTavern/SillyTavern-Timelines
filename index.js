// The main script for the extension
// The following are examples of some basic extension functionality

//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";

// Keep track of where your extension is located
const extensionName = "example-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}/`;
const extensionSettings = extension_settings[extensionName];

function onButtonClick() {
  // This function is called when the button is clicked
  // You can do whatever you want here
}

// This function is called when the extension is loaded
jQuery(async () => {
  // This is an example of loading HTML from a file
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);

  // Append settingsHtml to extensions_settings
  // extension_settings and extensions_settings2 are the left and right columns of the settings menu
  // You can append to either one
  $("#extensions_settings").append(settingsHtml);

  // These are examples of listening for events
  $("#my_button").on("click", onButtonClick());

  // Load settings when starting things up (if you have any)
  loadSettings();
});
