# SillyTavern Timeline Extension
![STTL](https://github.com/city-unit/SillyTavern-Timelines/assets/140349364/7ef54816-b156-4002-af46-236635b6f0d6)
An extension to allow for timeline based navigation of ST chat histories.


## Features

- Display all chats with the current character. Chat messages with the same content will be shown as a single node on the timeline.
- Search all current character message content with realtime fulltext filtering.
- Theming based on UI theme or custom theme.
- Branch your chat from any chat or swipe.

## Installation and Usage

### Installation

Use ST's inbuilt extension installer.

### Usage

Extensions > Timelines > View Timeline

- Nodes with swipes appear with a halo around them. There is also a setting to make them subtly larger.
- Checkpoints (named branches) appear with a colored ring around them.
- Checkpoint paths are colored and are visible in the legend.
  - The color is random, but always the same for the same checkpoint name.
  - Dead checkpoint links (pointing to deleted or renamed chat files) are automatically ignored when building the graph.
    - Those checkpoints will not appear in the timeline view.
  - **NOTE**: If you overwrite a checkpoint (by creating a new one at the same message in the same chat):
    - Doing so severs the link to the chat file that was created when making the original checkpoint.
    - Only the **new** checkpoint path will then appear in the timeline view.
    - The chat file belonging to the old checkpoint will appear as an independent chat file (in the full info panel for a node), not connected to any checkpoint.
- Long-pressing a node with swipes reveals the swipes on the graph.
- Clicking a node opens the full info about it.
  - At the bottom of the full info panel, you then have the options to go to that message in any of the chats it is part of, or to create a new chat branch from that message.
  - On a swipe node, if the swipe is not on the last message in that particular chat timeline, it is not possible to go to the swipe without creating a new branch. In this situation, the button to go to the message is grayed out, but the button to create a branch is available.
- Double-clicking a node goes straight to the message.
  - If you double-click a swipe node, what happens depends on whether it is the last node in that particular chat timeline.
  - On the last node, double-clicking a swipe opens the original chat, goes to the last message, and switches to that swipe.
  - On a non-last node, double-clicking automatically creates a new branch so that the stored swipes become accessible. It then opens the new chat, goes to the (now-last) message, and switches to that swipe.

If you find yourself amid a profusion of branches, consider using ST's built-in *Manage chat files* view (or a file manager) to delete any extra ones.

The extension adds a slash command:

- `/tl` - open the timeline view
- `/tl r` - refresh the timeline graph

Binding the `/tl` command to a custom Quick Reply button gives convenient one-click access to the timeline view. For a short name for the button, consider "⏳" (U+23F3, HOURGLASS WITH FLOWING SAND).



## Prerequisites

SillyTavern version >=1.10.4

## Support and Contributions

All feedback and issues welcome.

## License

[MIT](https://github.com/city-unit/SillyTavern-Timelines/blob/master/LICENSE)
