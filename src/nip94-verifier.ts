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

      const sub = pool.sub(relays, [{
        ids: [eventId],
        kinds: [1063]
      }]);

      timeoutId = setTimeout(() => {
        if (!eventFound) {
          pool.close(relays);
          reject(new Error('Timeout waiting for event'));
        }
      }, 10000);

      sub.on('event', (event: NostrEvent) => {
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
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          pool.close(relays);
        }
      });
    });
  } catch (error) {
    console.error('Verification failed:', error);
    setFailed(error instanceof Error ? error.message : 'Unknown error during verification');
    throw error;
  }
}

// Add this to your src/index.ts
if (process.env.VERIFY_MODE === 'true') {
  verifyNIP94Event()
    .catch(error => {
      setFailed(error instanceof Error ? error.message : 'Verification failed');
    });
}
