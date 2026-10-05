# Shared Thought Space

## Project Idea

Shared Thought Space grew from my earlier **Thought Bubbles** idea. It is a shared space where people can leave thoughts as floating bubbles.

After signing in, users can type a thought and press Enter. It becomes a white floating bubble. Firebase Realtime Database lets different users see the same shared thoughts in realtime.

Users can select two thoughts and click **Generate**, or drag two bubbles together and release them. AI can combine the two thoughts into a new idea.

The AI result first appears as a temporary pending bubble. The user decides:

- **Add to Space:** save the new idea to Firebase and share it.
- **Delete:** remove the pending idea only from the current browser.

Only **Add to Space** saves the AI result to Firebase. Combining thoughts does not delete or replace the two originals.

## Identity and Authentication

Users sign in with:

- Google.
- Email / Password, with registration for new accounts.

Firebase Authentication gives each user a unique `uid`. New thoughts save the creator's `uid`, including AI thoughts published with **Add to Space**.

The shared space appears only after sign-in. **Sign Out** returns to the login screen and clears the local bubbles and pending result.

Each user has a simple profile under:

```text
users/{uid}
```

The profile includes:

- `displayName`
- `email`
- `avatar`

Users can edit their display name and upload a profile image. Uploaded JPG, PNG, or WebP images are cropped to a square, resized to 96 × 96 pixels, and compressed in the browser. The small image is saved as a data URL in Firebase Realtime Database, without Firebase Storage. A Google profile photo can also be used as the default avatar.

The bubbles use the profile's avatar and display name. They never display email.

## Bubble Identity Design

Unselected bubbles show only a clean white bubble on the black background. Their avatar, name, and thought text are hidden.

Clicking a bubble reveals these items inside it:

- A small, sharp circular avatar.
- The user's display name.
- The thought text.

The avatar and text stay outside the SVG liquid filter, so they remain sharp. Selection does not permanently enlarge the bubble. Long thoughts can be scrolled, and long names may be shortened with an ellipsis to stay inside the bubble.

Up to two bubbles can be selected at once. Clicking a selected bubble again hides its information. Clicking empty space clears all selections.

Old thoughts without a `uid` still work. When selected, they show **Anonymous** and a simple circular placeholder. A missing avatar also uses the placeholder.

Pending AI bubbles follow the same selection behavior and use the current user's profile. Their existing dashed outline marks them as pending.

## Firebase Realtime Database

Firebase stores and synchronizes shared thoughts under:

```text
sharedThoughts/thoughts
```

New normal thoughts contain `text`, `type: "original"`, `uid`, `createdAt`, `x`, `y`, and `radius`. `createdAt` uses a Firebase server timestamp.

Published AI thoughts use `type: "combined"` and also store `parentIds`, the Firebase keys of the two source thoughts.

Firebase is the main source of truth. New shared bubbles are created through realtime listeners, including Firebase SDK local events, instead of creating a second separate local copy. New thoughts, changes, and deletions sync between signed-in browsers without refreshing.

Dragging a shared bubble saves its new position when the drag ends. Automatic floating stays local and does not write positions every frame. Deleting a shared thought asks for confirmation and removes it from Firebase and other browsers.

The interface loads the latest 10 shared thoughts. Older thoughts remain in Firebase unless someone deletes them. A pending bubble uses one of the 10 visible slots, so one shared bubble may be temporarily hidden.

## Security Rules

Realtime Database currently requires authentication:

```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

Users must be signed in to read or write shared thoughts. These rules allow any signed-in user to read and write database data; they do not limit changes to a user's own thoughts or profile.

This is a basic setup for class development, not a complete production security system.

## AI

The project uses the [NYU / ITP / IMA Replicate proxy](https://itp-ima-replicate-proxy.web.app/api/create_n_get) to combine two thoughts into one new idea.

The flow is:

Two thoughts → AI combination → local pending bubble → **Add to Space** or **Delete**.

Both **Generate** and intentional drag-to-combine use the same AI function. Normal floating collisions do not call AI. The two original thoughts remain.

The result stays only in the current browser until the user clicks **Add to Space**. Other users cannot see the pending result. After it is saved to Firebase, it becomes visible to everyone signed in to the shared space.

**Delete** on a pending result removes it locally without sharing it. Only one pending result can exist at a time. Refreshing or signing out discards it.

If generation fails, the originals remain and the page shows an error. The current source leaves the proxy's `Authorization` bearer token empty. If the proxy requires a token, it must be configured separately; no private token belongs in this README.

## How to Run

The current preview uses Python's local HTTP server. Open a terminal in the project folder and run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open [http://localhost:8000](http://localhost:8000).

Keep the terminal running. If the server is already running, use the existing URL. Firebase and AI need an internet connection.

## How to Test

Open [http://localhost:8000](http://localhost:8000) in Safari and Chrome on the same computer.

1. Sign in with User A in Safari.
2. Sign in with User B in Chrome.
3. Add a thought in one browser by typing it and pressing Enter. Add another if there are not yet two thoughts to combine.
4. The new thoughts should appear in the other browser without refreshing.
5. Drag a shared bubble to an open area and release it.
6. Its saved position should sync to the other browser. Slow floating continues locally.
7. In one browser, select two thoughts and click **Generate** to create a pending AI thought.
8. The other browser should not see the pending result yet.
9. Click **Add to Space**.
10. Both browsers should now see the new shared thought.
11. Click a bubble to see its avatar, display name, and thought inside it.

## Main Features

- Pure black background and white liquid bubbles.
- Thought size based on text length, with minimum and maximum sizes.
- Clean unselected bubbles; avatar, name, and text appear only when selected.
- Sharp circular avatars, neutral placeholders, and support for old anonymous thoughts.
- Google sign-in, Email / Password registration and sign-in, and Sign Out.
- Editable display names and profile image uploads.
- Chinese and English input, with Chinese IME handling and no empty thoughts.
- Slow floating, soft collisions, dragging, and a click pulse.
- Liquid merge animation and intentional drag-to-combine.
- Selection of up to two bubbles and a **Generate** button.
- AI combination through the NYU / ITP / IMA Replicate proxy.
- A local pending AI bubble with **Add to Space / Delete**.
- Firebase realtime sync for shared thoughts, saved drag positions, deletion, and profiles.
- Shared **Delete** with confirmation.
- A maximum of 10 visible bubbles, while older shared history stays in Firebase.
- Creator `uid` on new thoughts and `parentIds` on published AI thoughts.
