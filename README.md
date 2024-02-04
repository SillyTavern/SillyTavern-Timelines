# SillyTavern Timelines Extension

![STTL_screenshot](https://github.com/Technologicat/SillyTavern-Timelines/assets/16972251/7fccb43f-b4f6-4e1d-8fdf-3bd68dfb1969)
An extension for timeline based navigation of ST chat histories.

Think *Loom* [[1]](https://generative.ink/posts/loom-interface-to-the-multiverse/) [[2]](https://www.lesswrong.com/posts/bxt7uCiHam4QXrQAA/cyborgism#Appendix__Testimony_of_a_Cyborg), but built on ST's chat paradigm.


## Features

- Display all chats with the current character. Chat messages with the same content are shown as a single node on the timeline.
- Search all current character message content with realtime fulltext filtering.
- Theming based on UI theme or custom theme.
- Branch your chat from any chat or swipe.

## Installation and Usage

### Installation

Use ST's inbuilt extension installer.

### Usage

- Settings: *Extensions > Timelines*
- Open the timeline view: *Extensions > Timelines > View Timeline*
- Slash commands:
  - `/tl` - Open the timeline view (same as pressing the *View Timeline* button)
  - `/tl r` - Refresh the timeline graph

For convenient one-click access, bind the `/tl` command to a custom Quick Reply button. A useful short label is "⏳" (U+23F3, HOURGLASS WITH FLOWING SAND).

- *Nodes with swipes* appear with a halo around them.
  - There is also a setting to make them subtly larger.
- *Checkpoint nodes* appear with a colored ring around them.
  - If using the UI theme, the ring is a golden yellow.
  - If using a custom theme, the color is configurable.
- *Checkpoint paths* are colored accordingly, and are shown in the legend.
  - The checkpoint color is random, but determined from the checkpoint name.
  - A checkpoint is detected only when there is an intact checkpoint link in the chat file that originated the checkpoint. Dead links are ignored.
- The identical content auto-merge only combines messages at the same depth (sequential message number in the chat).
  - Thus the graph is always [acyclic](https://en.wikipedia.org/wiki/Directed_acyclic_graph), even if you use the same canned *Quick Reply* at multiple points in the same chat.
  - But chats that use the same *Quick Reply* at the same depth will all be routed through the node that represents that quick reply at that depth.
  - The same occurs if you send e.g. just "Thanks!", and that happens to be at the same chat depth as an earlier "Thanks!" in some other timeline.

Actions:

- *Opening the timeline view* auto-zooms to the current chat, and flashes the last node *in that chat* to clearly show it on the graph.
  - This might not be the latest node on the timeline, if there is another chat that still continues after that point.
  - There is also a button to zoom to the current chat.
- *Hovering over a node* shows a short preview of the message text, and highlights all of its incoming and outgoing edges.
- *Long-pressing a node* with swipes reveals the swipes on the graph.
  - The timeline view allows you to see and access swipes also on previous messages, not just the last one.
  - There is also a *Toggle swipes* button to reveal/hide swipes for the whole graph.
  - There is a setting to *Auto-expand Swipes* when the timeline view first opens, and when the graph is refreshed.
- *Clicking a node* opens a full info panel about it.
  - The panel has buttons to go to that message in any of the chats it is part of, or to create a new chat branch starting from that message.
  - On a swipe node, if the swipe is not on the last message in that particular chat timeline, it is not possible to go to the swipe without creating a new branch.
    - In this situation, the button to go to the message is grayed out, but the button to create a branch is available.
- *Double-clicking a node* goes straight to the message.
  - If the same message appears in multiple chat files, one of them is picked automatically. Usually this picks the most recent chat.
    - When this happens, a notification is shown with the chat file name.
    - If it's not the chat file you wanted, just open the timelines view again, click on the node, and pick the correct chat file explicitly from the full info panel.
  - If you double-click a swipe node, what happens depends on whether it is the last node in that particular chat.
    - On the last node, double-clicking a swipe opens the original chat, goes to the last message, and switches to that swipe.
    - On a non-last node, double-clicking automatically creates a new branch, opens the new chat, goes to the (now-last) message, and switches to that swipe.
- *Hovering over an edge* highlights that edge.
- *Clicking an edge* navigates to its far end (as measured from the click position), and zooms into the node there.
- *Clicking a legend entry* highlights it and zooms into it. Clicking the same entry again removes the highlight, and zooms out.
- *Focusing the fulltext search* or *typing into the fulltext search* highlights and zooms to the search results in realtime. When no match, or if you clear the search, it zooms out.
- The fulltext search is an *incremental fragment search* a.k.a. *swoop*. For example, the query `ear xam oop` would match this line (and in this document, only this line).
  - A *swoop* is an AND search using whitespace-delimited *fragments*. Their ordering in the query does not matter.
  - Swoop is a highly efficient way to quickly navigate large collections of text, inspired by the *HELM Swoop* function of the *Helm* package in *Emacs*.
  - You can still use the Timelines search like you would a classical substring search (but that's not taking advantage of swoop's full potential).

Hover tooltips describe available actions at any node or edge.

### Checkpoints

While checkpoints are a core ST feature, *Timelines* takes them to center stage, so we explain them briefly here.

A checkpoint is just a named chat branch. Branches, including checkpoints, are essentially separate chat files. You may sometimes see the old term *bookmark*, which means *checkpoint*.

*Timelines* itself only creates (unnamed) branches.

Checkpoints are created in the ST main GUI. To create a checkpoint, go to the chat message you want, and then press the *Checkpoint* button in the *Message Actions* for that message. The actions are in the "..." menu, unless you have enabled *Expand Message Actions* in your *User Settings* (advanced mode).

To rename a checkpoint, rename the file in a file manager.

To delete a branch or checkpoint, use ST's built-in *Manage chat files* view, or a file manager. Roughly speaking: delete the chat file that was spawned by the branch or checkpoint, and the branch/checkpoint will be gone.

However, checkpoint tracking complicates things slightly:

- Creating a checkpoint spawns a new chat file (the *checkpoint chat file*), but it also inserts a *checkpoint link* into the originating chat file.
  - The link belongs to a specific message. Each chat message can have at most one checkpoint link.
  - As of ST 1.11.3, checkpoint links cannot be deleted in the GUI (but this does not matter much).
- If you later overwrite a checkpoint, by creating a new one at the same message in the same chat, doing so severs the original link.
  - This does not overwrite the old checkpoint chat file. Only the checkpoint link in the originating chat file is overwritten.
- If you delete or rename the checkpoint chat file, this leaves a dead link in the originating chat file.

*Timelines* tracks checkpoint paths by following checkpoint links, ignoring any dead links. Therefore:

- If you delete or rename a checkpoint chat file, that checkpoint vanishes from the timeline view.
  - A renamed checkpoint chat file appears as an independent chat file in the timeline view (in the full info panel for nodes containing its messages), not connected to any checkpoint.
- If you overwrite a checkpoint, only the **new** checkpoint is tracked as a checkpoint path.
  - The checkpoint chat file for the old checkpoint then appears as an independent chat file in the timeline view.
- The *checkpoint node* in the graph is at the message where the *originating* chat file has the checkpoint link.


## Prerequisites

SillyTavern version >=1.10.4

## Support and Contributions

All feedback and issues welcome.

## License

[MIT](https://github.com/city-unit/SillyTavern-Timelines/blob/master/LICENSE)
