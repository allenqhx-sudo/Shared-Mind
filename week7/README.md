# Shared Mind — Week 7

Live version:  
https://allenqhx-sudo.github.io/Shared-Mind/week7/

## What I Changed

This week, I moved my Shared Thought Space from a 2D interface into a 3D environment using Three.js.

Related Thought Goos now form groups in different areas and depths, while unrelated ideas stay farther apart. The space uses x, y, and z positions to make semantic relationships easier to see.

Users can rotate and zoom the camera, select individual Thought Goos, and interact with ideas inside the 3D space.

Relationship strength is also visible. Weaker relationships use one thinner strand, while stronger relationships can use a thicker main strand and a second smaller strand.

## Why 3D

I did not use 3D only to make the project look more impressive.

I wanted to test whether depth, distance, viewpoint, and direct spatial interaction could help users understand relationships between ideas.

A thought can now feel close, far away, isolated, or part of a larger semantic group.

## Methods

### Three.js

I used Three.js to create:

- a 3D scene
- a perspective camera
- a WebGL renderer
- 3D Thought Goo meshes
- camera controls
- raycasting
- animation
- 3D relationship strands

### Semantic Clusters

The project continues to use text embeddings and cosine similarity.

Accepted semantic relationships are used to organize related Thought Goos into separate 3D clusters.

Unrelated groups can remain farther apart, and isolated thoughts do not need to connect to anything.

### Relationship Strands

Semantic relationships are shown with simple elastic black strands.

- weak relationship: one thin strand
- medium relationship: one clearer strand
- strong relationship: one main strand and one smaller secondary strand
- unrelated thoughts: no strand

### Existing Systems

The 3D version keeps the systems developed in previous weeks:

- Firebase Realtime Database
- Firebase Authentication
- user profiles and avatars
- local Transformers.js embeddings
- cosine similarity
- Navigation by Creation
- AI Combine through the NYU / ITP / IMA proxy
- Pending Thought
- Add to Space / Delete

## Current Flow

User signs in

→ Firebase loads shared thoughts

→ each thought becomes a 3D Thought Goo

→ stored embeddings are compared

→ cosine similarity finds semantic relationships

→ related thoughts form 3D clusters

→ unrelated groups stay farther apart

→ user rotates, zooms, selects, and moves through the space

→ user can still combine two thoughts with AI

→ new result becomes a Pending Thought

→ Add to Space / Delete

## Tools

- HTML
- CSS
- JavaScript
- Three.js
- OrbitControls
- Raycasting
- WebGL
- Firebase Realtime Database
- Firebase Authentication
- Transformers.js
- multilingual text embeddings
- cosine similarity
- NYU / ITP / IMA Replicate proxy

## Current Limitations

- UMAP is not included.
- The project is not a VR experience.
- It does not use first-person walking.
- The spatial layout is still an experimental interface.
- Only a limited number of thoughts are displayed at one time.
