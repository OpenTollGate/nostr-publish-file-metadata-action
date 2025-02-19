#!/usr/bin/env python3

import os
import sys
import json
import time
import ssl
from typing import Optional, Dict, List
from nostr.event import Event
from nostr.key import PrivateKey
from nostr.relay_manager import RelayManager

class NIP94Publisher:
    def __init__(self, relays: List[str], private_key_hex: str):
        self.relays = relays
        self.private_key = PrivateKey(bytes.fromhex(private_key_hex))

    def create_nip94_event(
        self,
        url: str,
        mime_type: str,
        file_hash: str,
        original_hash: str,
        content: str = "",
        size: Optional[int] = None,
        dimensions: Optional[str] = None
    ) -> Event:
        """Create a NIP-94 event with the required metadata"""
        
        # Mandatory tags
        tags = [
            ["url", url],
            ["m", mime_type],
            ["x", file_hash],
            ["ox", original_hash]
        ]

        # Optional tags
        if size is not None:
            tags.append(["size", str(size)])
        if dimensions:
            tags.append(["dim", dimensions])

        # Create event with kind 1063 (NIP-94)
        event = Event(
            content=content,
            kind=1063,
            tags=tags,
            public_key=self.private_key.public_key.hex()
        )
        
        # Sign the event
        self.private_key.sign_event(event)
        return event

    def publish_event(self, event: Event) -> Dict[str, bool]:
        """Publish event to relays with resilient handling"""
        results = {}
        
        for relay_url in self.relays:
            try:
                # Initialize relay manager for single relay
                relay_manager = RelayManager()
                relay_manager.add_relay(relay_url)
                
                # Open connection with SSL verification disabled
                relay_manager.open_connections({"cert_reqs": ssl.CERT_NONE})
                time.sleep(1.25)  # Allow connection time
                
                # Publish event
                relay_manager.publish_event(event)
                time.sleep(1)  # Wait forresults[relay_url] = True
                print(f"Successfullyurl")
                
            except Exception as e:
                print(f"Failed to publish to {relay_url}: {str(e)}")
                results[relay_url] = False
                
            finally:
                try:
                    relay_manager.close_connections()
                except:
                    pass
        
        return results

def main():
    # Get inputs from environment variables (GitHub Actions style)
    required_inputs = [
        'INPUT_RELAYS',
        'INPUT_URL',
        'INPUT_MIMETYPE',
        'INPUT_FILEHASH',
        'INPUT_ORIGINALHASH',
        'INPUT_NSEC'
    ]

    # Validate required inputs
    for input_name in required_inputs:
        if input_name not in os.environ:
            print(f"::error::Missing required input {input_name}")
            sys.exit(1)

    # Parse inputs
    relays = os.environ['INPUT_RELAYS'].split(',')
    url = os.environ['INPUT_URL']
    mime_type = os.environ['INPUT_MIMETYPE']
    file_hash = os.environ['INPUT_FILEHASH']
    original_hash = os.environ['INPUT_ORIGINALHASH']
    nsec = os.environ['INPUT_NSEC']
    
    # Optional inputs
    content = os.environ.get('INPUT_CONTENT', '')
    size = int(os.environ['INPUT_SIZE']) if 'INPUT_SIZE' in os.environ else None
    dimensions = os.environ.get('INPUT_DIMENSIONS')

    try:
        # Initialize publisher
        publisher = NIP94Publisher(relays, nsec)
        
        # Create NIP-94 event
        event = publisher.create_nip94_event(
            url=url,
            mime_type=mime_type,
            file_hash=file_hash,
            original_hash=original_hash,
            content=content,
            size=size,
            dimensions=dimensions
        )

        # Publish event
        results = publisher.publish_event(event)
        
        # Set outputs (GitHub Actions style)
        print(f"::set-output name=eventId::{event.id}")
        print(f"::set-output name=noteId::note1{event.id}")
        
        # Check if we had at least one successful publish
        if not any(results.values()):
            print("::error::Failed to publish to any relay")
            sys.exit(1)
            
        print(f"Event published successfully: {event.id}")
        print("View on:")
        print(f"- https://snort.social/e/note1{event.id}")
        print(f"- https://primal.net/e/{event.id}")

    except Exception as e:
        print(f"::error::Failed to publish NIP-94 event: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
