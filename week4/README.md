# Shared Thought Space

## Project Idea

Shared Thought Space started from my earlier **Thought Bubbles** idea.

Each person can type a thought and press Enter. The thought becomes a white floating bubble. All shared thoughts are saved in Firebase Realtime Database, so different people opening the same website can see the same thought space in realtime.

Users can select two bubbles and click **Generate**, or drag one bubble onto another and release it. AI combines the two thoughts into one new idea.

The AI result first appears as a temporary local bubble. The user then decides:

- **Add to Space** — save the new thought to Firebase and share it.
- **Delete** — discard the temporary thought locally.

Only **Add to Space** sends the AI result to Firebase. There are no usernames or author information. The focus is on how one thought can connect with another and create a new thought over time.

## Main Features

- Pure black background.
- White liquid thought bubbles.
- Bubble size based on text length.
- Minimum and maximum bubble size.
- Text hidden by default.
- Click a bubble to reveal its thought.
- Slow automatic floating movement.
- Soft bubble collisions.
- Draggable bubbles.
- Liquid merge effect.
- Maximum 10 visible bubbles.
- Select up to two bubbles.
- Drag two bubbles together to combine them.
- **Generate** button.
- **Delete** button for selected shared thoughts, with confirmation.
- Firebase realtime sync.
- AI combination through the NYU / ITP / IMA Replicate proxy.
- Pending AI result shown as a local bubble with a dashed white ring.
- **Add to Space / Delete** buttons for the pending result.
- No usernames or author information.

## Firebase

Firebase Realtime Database is the shared backend. Public thoughts are stored under:

```text
sharedThoughts/thoughts
```

Normal thought data contains:

- `text` — the full thought.
- `type` — `"original"` for a thought entered by a person.
- `createdAt` — a Firebase server timestamp.
- `x` — the saved horizontal position.
- `y` — the saved vertical position.
- `radius` — the bubble's size.

AI-combined thoughts use `type: "combined"` and also store:

- `parentIds` — the Firebase keys of the two source thoughts.

Firebase is the main source of truth. New public bubbles appear only when Firebase's realtime listener receives their data. The page does not create a separate public bubble before sending the thought to Firebase. Changes and deletions also reach other browsers through these listeners.

Dragging a public bubble saves its new `x` and `y` to Firebase when the drag ends. Automatic floating movement is local and is not saved every frame.

The page loads the latest 10 shared thoughts. Older thoughts stay in Firebase unless a user deletes them. While a pending AI thought exists, it uses one of the 10 visible slots, so another shared bubble may be temporarily hidden.

## AI

The project uses the [NYU / ITP / IMA Replicate proxy](https://itp-ima-replicate-proxy.web.app/api/create_n_get) with the `google/gemini-2.5-flash` model. It does not use a personal Replicate API key.

The flow is:

Two thoughts → AI combines them → temporary pending bubble → user chooses **Add to Space** or **Delete**.

Both **Generate** and intentional drag-to-combine use the same AI function. Normal floating collisions do not call AI.

During generation, the two source bubbles pause and the page shows “Connecting thoughts...”. Another combination cannot start while a request or pending result exists. If the request fails, the originals remain, movement resumes, and a small error message appears. There is no automatic retry or fake result.

Combining always keeps the two original thoughts. It does not delete or replace them. The latest-10 display limit still applies, and shared thoughts can still be removed with the shared **Delete** button.

## Pending Thought

A pending thought exists only in the current browser. Other users cannot see it. It has a thin dashed white ring, floats slowly, can be dragged, and reveals its text when clicked.

Only one pending AI thought can exist at a time.

- **Add to Space:** saves the thought to Firebase. The realtime listener creates the shared bubble, then the temporary bubble is removed. The new thought becomes visible to everyone viewing the shared space.
- **Delete:** removes only the temporary bubble. It is never shared, and neither parent thought is changed.

## How to Run

The current preview uses Python's local HTTP server on port 8000.

Open a terminal in the project folder and run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open [http://localhost:8000](http://localhost:8000).

Keep the terminal running while using the preview. If the server is already running, open the URL without starting another server. An internet connection is needed for Firebase and AI.

## How to Test Realtime

1. Open [http://localhost:8000](http://localhost:8000) in both Safari and Chrome on the same computer.
2. Add a thought in Safari by typing it and pressing Enter.
3. It should appear in Chrome without refreshing.
4. Add another thought in Chrome.
5. It should appear in Safari without refreshing.
6. Drag a public bubble to an open area and release it.
7. Its new position should sync to the other browser. Automatic floating continues locally.
8. In one browser, select two shared bubbles and click **Generate** once.
9. Before clicking **Add to Space**, the other browser should not see the pending AI result.
10. Click **Add to Space**. Both browsers should see the new shared thought without refreshing.

## Important Note

Firebase currently uses test rules for class development. This setup is not production secure. It has no user authentication, and shared thoughts can be deleted by other users. Do not treat this shared space as private storage.
