// src/nip94-verifier.ts
import { SimplePool, Filter } from 'nostr-tools';
import { getInput } from '@actions/core';
import WebSocket from 'ws';
(global as any).WebSocket = WebSocket;

export async function verifyNIP94Event() {
  const relays = getInput('relays').split(',');
  const eventId = getInput('eventId');
  const expectedContent = getInput('expectedContent');
  
  const pool = new SimplePool();
  const filter: Filter = {
    ids: [eventId],
    kinds: [1063]
  };

  try {
    const events = await pool.list(relays, [filter], { 
      timeout: 10000 // 10 second timeout
    });

    if (events.length === 0) {
      throw new Error('Event not found on any relays');
    }

    const event = events[0];
    if (event.content !== expectedContent) {
      throw new Error(`Content mismatch\nExpected: ${expectedContent}\nReceived: ${event.content}`);
    }

    // Validate SHA-256 hash if available in tags
    const xTag = event.tags.find(t => t[0] === 'x');
    if (!xTag || xTag[1] !== getInput('fileHash')) {
      throw new Error('File hash validation failed');
    }

    console.log('✅ Verification passed');
  } finally {
    pool.close(relays);
  }
}