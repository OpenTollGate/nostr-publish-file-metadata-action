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
    return new Promise<void>((resolve, reject) => {
      const sub = pool.subscribe(relays, [filter], {
        timeout: 10000
      });

      sub.on('event', (event) => {
        if (event.id === eventId) {
          sub.unsub();
          
          if (event.content !== expectedContent) {
            reject(`Content mismatch\nExpected: ${expectedContent}\nReceived: ${event.content}`);
          }

          const xTag = event.tags.find((t: string[]) => t[0] === 'x');
          if (!xTag || xTag[1] !== getInput('fileHash')) {
            reject('File hash validation failed');
          }

          console.log('✅ Verification passed');
          resolve();
        }
      });

      sub.on('eose', () => {
        reject('Event not found on any relays');
      });
    });
  } finally {
    pool.close(relays);
  }
}
