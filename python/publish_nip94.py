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
        print(f"Initialized with {len(relays)} relays")

        # Get public key in different formats
        self.public_key_hex = self.private_key.public_key.hex()
        self.public_key_bech32 = self.private_key.public_key.bech32()
        print(f"Public Key (hex): {self.public_key_hex}")
        print(f"Public Key (bech32): {self.public_key_bech32}")

    def find_event_on_relays(self, event_id: str):
        """Manual search tool for debugging"""
        from nostr.filter import Filter
        from nostr.event import EventKind
        
        filter = Filter(event_ids=[event_id])
    
        for relay_url in self.relays:
            try:
                print(f"\nChecking {relay_url}...")
                relay_manager = RelayManager()
                relay_manager.add_relay(relay_url)
                relay_manager.open_connections({"cert_reqs": ssl.CERT_NONE})
                relay_manager.add_subscription("debug", [filter])
                time.sleep(3)  # Wait for responses

                while relay_manager.message_pool.has_events():
                    msg = relay_manager.message_pool.get_event()
                    print(f"Received message: {msg[:200]}...")

            except Exception as e:
                print(f"Debug error: {str(e)}")
            finally:
                relay_manager.close_connections()
        
    def create_nip94_event(self, url: str, mime_type: str, file_hash: str,
                          original_hash: str, content: str = "",
                          size: Optional[int] = None,
                          dimensions: Optional[str] = None) -> Event:
        """Create a NIP-94 event with the required metadata"""
        
        print("Creating NIP-94 event...")
        
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
        """
        event = Event(
            content=content,
            kind=1063,
            tags=tags,
            public_key=self.private_key.public_key.hex()
        )
        """

        event = Event(
            content="Hello Nostr",
            public_key=self.public_key_hex,
            created_at=int(time.time()),
            kind=1,
            tags=[]
        )

        # Sign the event
        self.private_key.sign_event(event)
        
        #print(f"Event created successfully:")
        #print(f"- ID: {event.id}")
        #print(f"- Kind: {event.kind}")
        #print(f"- Tags: {len(tags)}")
        
        return event

    def publish_event(self, event: Event) -> Dict[str, bool]:
        """Publish event to relays with resilient handling"""
        results = {}
        
        for relay_url in self.relays:
            relay_manager = None
            try:
                print(f"\nAttempting to publish to {relay_url}...")
                
                # Initialize relay manager for single relay
                relay_manager = RelayManager()
                relay_manager.add_relay(relay_url)
                
                # Open connection with SSL verification disabled
                print(f"Opening connection to {relay_url}...")
                relay_manager.open_connections({"cert_reqs": ssl.CERT_NONE})
                time.sleep(2)  # Increased wait time for connection
            
                # Publish event
                print(f"Publishing event to {relay_url}...")
                publish_result = relay_manager.publish_event(event)
            
                # Wait for confirmation
                time.sleep(2)  # Increased wait time for publishing
            
                # Set result based on successful publish
                results[relay_url] = True
                print(f"Successfully published to {relay_url}")
            
            except Exception as e:
                print(f"Failed to publish to {relay_url}: {e}")
                results[relay_url] = False
            
            finally:
                if relay_manager:
                    try:
                        print(f"Closing connection to {relay_url}...")
                        relay_manager.close_connections()
                        time.sleep(0.5)  # Give time for clean closure
                    except Exception as e:
                        print(f"Error closing connection to {relay_url}: {e}")
                    
        # Print summary
        successful = sum(1 for result in results.values() if result)
        print(f"\nPublishing Summary:")
        print(f"Successfully published to {successful} out of {len(self.relays)} relays")
        for relay, success in results.items():
            print(f"- {relay}: {'✓' if success else '✗'}")
        return results

    def verify_event_published(self, event: Event, timeout: int = 120) -> bool:
        """Verify event exists on at least one relay"""
        for relay_url in self.relays:
            try:
                relay_manager = RelayManager()
                relay_manager.add_relay(relay_url)
                relay_manager.open_connections({"cert_reqs": ssl.CERT_NONE})

                # Filter by specific event ID only
                filters = [{"ids": [event.id]}]
                subscription_id = f"verify_{event.id[:8]}"
                print("subscription_id: ", subscription_id)
                relay_manager.add_subscription(subscription_id, filters)
                print(f"Checking {relay_url} for event {event.id[:8]}...")
                start_time = time.time()
            
                # Process messages in real-time
                while time.time() - start_time < timeout:
                    relay_manager.run_sync()
                    while relay_manager.message_pool.has_events():
                        msg = relay_manager.message_pool.get_event()
                        print("msg: ", str(msg))
                        if isinstance(msg, list) and msg[0] == "EVENT":
                            received_event = msg[2]
                            if received_event["id"] == event.id:
                                print(f"Found event on {relay_url}!")
                                return True
                    time.sleep(1)
                
            except Exception as e:
                print(f"Verification error on {relay_url}: {str(e)}")
            finally:
                relay_manager.close_connections()
        return False


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
    # size = int(os.environ['INPUT_SIZE']) if 'INPUT_SIZE' in os.environ else None
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
            # size=size,
            dimensions=dimensions
        )

        event_dict = {
            "id": event.id,
            "pubkey": event.public_key,
            "created_at": event.created_at,
            "kind": event.kind,
            "tags": event.tags,
            "content": event.content
        }
        print("event: ", json.dumps(event_dict, indent=2))

        # Publish event
        results = publisher.publish_event(event)
        
        # Set outputs using the new GitHub Actions format
        with open(os.environ['GITHUB_OUTPUT'], 'a') as fh:
            print(f"eventId={event.id}", file=fh)
            print(f"noteId=note1{event.id}", file=fh)
        
        # Check if we had at least one successful publish
        successful_publishes = sum(1 for result in results.values() if result)
        if successful_publishes == 0:
            print("::error::Failed to publish to any relay")
            sys.exit(1)
        else:
            print(f"\nSuccessfully published to {successful_publishes} relays")
            print(f"Event ID: {event.id}")
            print("View on:")
            print(f"- https://snort.social/e/note1{event.id}")
            print(f"- https://primal.net/e/{event.id}")

    except Exception as e:
        print(f"::error::Failed to publish NIP-94 event: {str(e)}")
        traceback.print_exc()  # Print full stack trace
        sys.exit(1)

if __name__ == "__main__":
    main()
