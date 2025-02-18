// src/nip94-publisher.ts
import { getInput, setFailed, setOutput } from "@actions/core";
import { SimplePool, nip19 } from "nostr-tools";
import { finalizeEvent } from "nostr-tools/pure";
import WebSocket from 'ws';
global.WebSocket = WebSocket;
async function publishNIP94Event(inputs) {
    const pool = new SimplePool();
    try {
        const tags = [
            ["url", inputs.url],
            ["m", inputs.mimeType],
            ["x", inputs.fileHash],
            ...(inputs.originalHash ? [["ox", inputs.originalHash]] : []),
            ...(inputs.size ? [["size", inputs.size.toString()]] : []),
            ...(inputs.dimensions ? [["dim", inputs.dimensions]] : []),
        ];
        const eventTemplate = {
            kind: 1063,
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content: inputs.content,
        };
        const signedEvent = finalizeEvent(eventTemplate, inputs.nsec);
        return {
            eventId: signedEvent.id,
            noteId: nip19.noteEncode(signedEvent.id),
            rawEvent: signedEvent,
        };
    }
    finally {
        pool.close(inputs.relays);
    }
}
// Update input processing
try {
    // Get all required inputs first
    const relays = getInput("relays").split(",");
    const url = getInput("url");
    const mimeType = getInput("mimeType");
    const fileHash = getInput("fileHash");
    const content = getInput("content");
    // Process nsec
    const nsecInput = getInput("nsec");
    const decoded = nip19.decode(nsecInput).data;
    const hexBytes = decoded.startsWith('nsec') ? decoded : decoded.slice(4);
    const nsecBytes = new Uint8Array(hexBytes.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    // Construct inputs with proper variable names
    const inputs = {
        relays,
        url,
        mimeType,
        fileHash,
        content,
        nsec: nsecBytes,
        originalHash: getInput("originalHash") || undefined,
        size: Number(getInput("size")) || undefined,
        dimensions: getInput("dimensions") || undefined,
    };
    publishNIP94Event(inputs)
        .then(result => {
        setOutput("eventId", result.eventId);
        setOutput("noteId", result.noteId);
        console.log(`Published NIP-94 event: ${result.noteId}`);
        console.log(`View on clients:
- https://snort.social/e/${result.noteId}
- https://primal.net/e/${result.eventId}`);
    })
        .catch(err => {
        throw new Error(`NIP-94 publish failed: ${err}`);
    });
}
catch (error) {
    console.error("Action failed:", error instanceof Error ? error.message : error);
    setFailed("NIP-94 publication failed");
}
