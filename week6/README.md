# Shared Mind — Week 6

Live version:  
https://allenqhx-sudo.github.io/Shared-Mind/week6/

## What I Changed

This week, I continued developing the Shared Thought Space by making the relationships between thoughts more meaningful.

Instead of only placing thoughts in the same shared space, I added text embeddings to each new thought. The system can now compare the meaning of different thoughts and find which ones are more related.

Similar Thought Goos slowly move closer to each other and create small black connections. Unrelated thoughts can stay separate, so the space can form different groups instead of becoming one large network.

I also added a new interaction called "Navigation by Creation." While the user is typing a new thought, the unfinished text is temporarily compared with existing thoughts. Related Thought Goos can be discovered before the user even posts the thought.

To make this interaction easier to see, small black Goo tentacles grow from the input area toward related thoughts and gently pull them closer.

## Methods

### Text Embeddings

I used:

`Xenova/paraphrase-multilingual-MiniLM-L12-v2`

with Transformers.js running directly in the browser.

Each thought is converted into an embedding vector and the vector is saved in Firebase.

### Cosine Similarity

I use cosine similarity to compare the embeddings of different thoughts.

The system filters the relationships so that only thoughts with strong enough similarity can connect. Each Goo only keeps a small number of strong semantic neighbors.

This prevents every thought from connecting to everything else.

### Semantic Attraction

Related Thought Goos have a small attraction force between them.

They slowly move closer while still keeping the existing organic movement, collision, dragging, and Goo behavior.

Semantic connections do not automatically combine thoughts.

AI Combine still only happens when the user intentionally drags one Goo onto another.

### Navigation by Creation

The text inside the input box temporarily becomes a semantic search point.

After the user stops typing for a short moment:

1. The draft text gets a temporary embedding.
2. It is compared with existing Thought Goos.
3. The most related thoughts are found.
4. Black Goo tentacles grow toward them.
5. The related Goos are gently pulled closer.

The draft embedding and tentacles are temporary and are not saved to Firebase.

## Current Flow

User types a thought

→ temporary embedding

→ find related existing thoughts

→ black tentacles connect to related Thought Goos

→ user submits the thought

→ thought is saved to Firebase

→ local embedding is generated

→ cosine similarity finds semantic relationships

→ related Thought Goos slowly connect and move closer

## Tools

- HTML / CSS / JavaScript
- Firebase Realtime Database
- Firebase Authentication
- Transformers.js
- Multilingual MiniLM text embeddings
- Cosine similarity
- Replicate through the ITP / IMA proxy for AI text combination
