// src/nip94-verifier.ts
import { SimplePool, Filter, Event } from 'nostr-tools';
import { getInput, setFailed } from '@actions/core';
import WebSocket from 'ws';
(global as any).WebSocket = WebSocket;

interface NostrEvent extends Event {
  id: string;
  content: string;
  tags: string[][];
}

export async function verifyNIP94Event() {
  const relays = getInput('relays').split(',');
  const eventId = getInput('eventId');
  const expectedContent = getInput('expectedContent');
  const expectedHash = getInput('fileHash');
  
  const pool = new SimplePool();
  
  try {
    return new Promise<void>((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;
      let eventFound = false;

      // Create a subscription using pool.subscribeMany()
      const sub = pool.subscribeMany(
        relays,
        [
          {
            ids: [eventId],
            kinds: [1063]
          }
        ],
        {
          onevent(event: NostrEvent) {
            eventFound = true;
            clearTimeout(timeoutId);
            
            try {
              if (event.content !== expectedContent) {
                throw new Error(`Content mismatch\nExpected: ${expectedContent}\nReceived: ${event.content}`);
              }

              const xTag = event.tags.find((t: string[]) => t[0] === 'x');
              if (!xTag || xTag[1] !== expectedHash) {
                throw new Error('File hash validation failed');
              }

              console.log('✅ Verification passed');
              pool.close(relays);
              resolve();
            } catch (error) {
              pool.close(relays);
              reject(error);
            }
          },
          oneose() {
            if (!eventFound) {
              pool.close(relays);
              reject(new Error('Event not found on any relays'));
            }
          }
        }
      );

      timeoutId = setTimeout(() => {
        if (!eventFound) {
          pool.close(relays);
          reject(new Error('Timeout waiting for event'));
        }
      }, 10000);
    });
  } catch (error) {
    console.error('Verification failed:', error);
    setFailed(error instanceof Error ? error.message : 'Unknown error during verification');
    throw error;
  }
}

// Add this check for verification mode
if (process.env.VERIFY_MODE === 'true') {
  verifyNIP94Event()
    .catch(error => {
      setFailed(error instanceof Error ? error.message : 'Verification failed');
      process.exit(1);
    });
}
