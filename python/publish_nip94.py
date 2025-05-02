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
import secrets

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

    def create_nip94_event(self, url: str, mime_type: str, file_hash: str,
                           original_hash: str, content: str = "",
                           filename: Optional[str] = None,
                           size: Optional[int] = None,
                           custom_tags: Dict[str, str] = {}) -> Event:
        """Create a NIP-94 event with the required metadata and optional custom tags"""

        print("Creating NIP-94 event...")

        # Mandatory tags
        tags = [
            ["url", url],
            ["m", mime_type],
            ["x", file_hash],
            ["ox", original_hash]
        ]

        # Optional tags
        if filename:
            tags.append(["filename", filename])
        if size is not None:
            tags.append(["size", str(size)])
            
        # Add any custom tags
        for key, value in custom_tags.items():
            tags.append([key, str(value)])
                
        # Create event with kind 1063 (NIP-94)
        event = Event(
            content=content,
            kind=1063,
            tags=tags,
            public_key=self.private_key.public_key.hex()
        )


        # Sign the event
        self.private_key.sign_event(event)
        
        print(f"Event created successfully:")
        print(f"- ID: {event.id}")
        print(f"- Kind: {event.kind}")
        print(f"- Tags: {len(tags)}")
        
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
        from nostr.filter import Filter, Filters
        from nostr.message_type import ClientMessageType

        for relay_url in self.relays:
            try:
                relay_manager = RelayManager()
                relay_manager.add_relay(relay_url)
            
                # Create filter for the specific event
                filters = Filters([Filter(event_ids=[event.id])])
                subscription_id = f"verify_{event.id[:8]}"
            
                # Setup request
                request = [ClientMessageType.REQUEST, subscription_id]
                request.extend(filters.to_json_array())
                
                # Open connection and add subscription
                relay_manager.add_subscription(subscription_id, filters)
                relay_manager.open_connections({"cert_reqs": ssl.CERT_NONE})
                time.sleep(1)  # Wait for connection

                # Send the request
                message = json.dumps(request)
                relay_manager.publish_message(message)
                time.sleep(2)  # Wait for response

                # Check for events
                while relay_manager.message_pool.has_events():
                    event_msg = relay_manager.message_pool.get_event()
                    if event_msg.event.id == event.id:
                        print(f"Found event on {relay_url}!")
                        relay_manager.close_connections()
                        print("event_msg: ", str(event_msg.event))
                        print("event_content: ", str(event_msg.event.content))
                        print("event_tags: ", str(event_msg.event.tags))
                        return True
                
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
        'INPUT_NSEC_HEX'
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
    nsec_hex = os.environ.get('INPUT_NSEC_HEX', '')  # Default to empty string if not set
    
    
    if not nsec_hex:
        print("nsec_hex is empty, generating a random one...")
        random_private_key = PrivateKey(secrets.token_bytes(32))
        nsec_hex = random_private_key.hex()
        print(f"Generated random nsec_hex: {nsec_hex}")
        sys.exit(1)
    else:
        print(f"nsec_hex is not empty")  # Debug print

    # Optional inputs
    content = os.environ.get('INPUT_CONTENT', '')
    filename = os.environ.get('INPUT_FILENAME')
    
    custom_tags_json = os.environ.get('INPUT_CUSTOM_TAGS_JSON')
    
    # Parse and validate custom tags JSON if provided
    custom_tags = {}
    if custom_tags_json:
        try:
            # Parse the JSON string
            parsed_json = json.loads(custom_tags_json)
            
            # Validate that it's a dictionary (key/value pairs)
            if isinstance(parsed_json, dict):
                custom_tags = parsed_json
                print(f"Successfully parsed custom tags: {custom_tags}")
            else:
                print("::warning::INPUT_CUSTOM_TAGS_JSON is not a valid dictionary/object. It will be ignored.")
        except json.JSONDecodeError as e:
            print(f"::warning::Failed to parse INPUT_CUSTOM_TAGS_JSON: {str(e)}. It will be ignored.")
    
    version = os.environ.get('INPUT_VERSION')
    branch = os.environ.get('INPUT_BRANCH')
    device_id = os.environ.get('INPUT_DEVICE_ID')

    try:
        # Initialize publisher
        publisher = NIP94Publisher(relays, nsec_hex)
        
        # Create NIP-94 event
        event = publisher.create_nip94_event(
            url=url,
            mime_type=mime_type,
            file_hash=file_hash,
            original_hash=original_hash,
            content=content,
            filename=filename,
            custom_tags=custom_tags
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

        # Set outputs using GitHub Actions Environment File and as fallback save to file
        event_id = event.id  # Store event ID
        note_id = f"note1{event.id}"  # Store note ID
        
        # Debug output handling
        print("\n===== Output Debug Information =====")
        print(f"Event ID to set: {event_id}")
        print(f"Note ID to set: {note_id}")
        
        if 'GITHUB_OUTPUT' in os.environ:
            github_output = os.environ['GITHUB_OUTPUT']
            with open(github_output, 'a') as fh:
                fh.write(f'eventId={event_id}\n')
                fh.write(f'noteId=note1{event_id}\n')
            print(f"Successfully wrote to GITHUB_OUTPUT file at {github_output}")
            with open(github_output, 'r') as fh:
                print("GITHUB_OUTPUT contents post-write:")
                print(fh.read())

        # Save as a fallback in case GITHUB_OUTPUT is not set
        print("GITHUB_OUTPUT environment variable not set. Saving event ID to event_id.txt")
        with open('event_id.txt', 'w') as f:
            f.write(event_id)

        # Also set environment variables as backup
        os.environ['EVENT_ID'] = event_id
        os.environ['NOTE_ID'] = note_id

        # Check if we had at least one successful publish
        successful_publishes = sum(1 for result in results.values() if result)
        if successful_publishes == 0:
            print("::error::Failed to publish to any relay")
            sys.exit(1)
        else:
            print(f"\nSuccessfully published to {successful_publishes} relays")
            print(f"Event ID: {event_id}")
            print("View on:")
            print(f"- https://snort.social/e/{note_id}")
            print(f"- https://primal.net/e/{event_id}")

    except Exception as e:
        print(f"::error::Failed to publish NIP-94 event: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()