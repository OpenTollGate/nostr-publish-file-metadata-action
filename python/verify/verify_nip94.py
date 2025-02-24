#!/usr/bin/env python3

import os
import sys
import time
import ssl
from nostr.event import Event
from nostr.key import PrivateKey
from nostr.relay_manager import RelayManager
from nostr.filter import Filter, Filters
from nostr.message_type import ClientMessageType
import json

def verify_event_on_relays(event_id: str, relays: list) -> bool:
    """Verify event exists on at least one relay"""
    print(f"Verifying event {event_id} on relays: {relays}")
    
    for relay_url in relays:
        try:
            print(f"\nChecking relay: {relay_url}")
            relay_manager = RelayManager()
            relay_manager.add_relay(relay_url)
        
            # Create filter for the specific event
            filters = Filters([Filter(event_ids=[event_id])])
            subscription_id = f"verify_{event_id[:8]}"
            request = [ClientMessageType.REQUEST, subscription_id]
            request.extend(filters.to_json_array())
            
            # Open connection and add subscription
            relay_manager.add_subscription(subscription_id, filters)
            relay_manager.open_connections({"cert_reqs": ssl.CERT_NONE})
            time.sleep(1)

            # Send the request
            message = json.dumps(request)
            relay_manager.publish_message(message)
            
            # Wait and check for events
            check_start = time.time()
            while time.time() - check_start < 10:
                if relay_manager.message_pool.has_events():
                    event_msg = relay_manager.message_pool.get_event()
                    if event_msg.event.id == event_id:
                        print(f"✓ Event found on {relay_url}!")

                        # Create event dictionary with all fields
                        event_dict = {
                            "id": event_msg.event.id,
                            "pubkey": event_msg.event.public_key,
                            "created_at": event_msg.event.created_at,
                            "kind": event_msg.event.kind,
                            "content": event_msg.event.content,
                            "tags": event_msg.event.tags
                        }
                        
                        print("\nEvent details:")
                        print(json.dumps(event_dict, indent=2))
                        
                        # Write to both output files
                        with open(os.environ['GITHUB_OUTPUT'], 'a') as fh:
                            fh.write("verify=true\n")
                        with open(os.environ['GITHUB_ENV'], 'a') as fh:
                            fh.write("VERIFY=true\n")
                        return True
                time.sleep(0.5)
            
            print(f"✗ Event not found on {relay_url}")
            # Write to both output files
            with open(os.environ['GITHUB_OUTPUT'], 'a') as fh:
                fh.write("verify=false\n")
            with open(os.environ['GITHUB_ENV'], 'a') as fh:
                fh.write("VERIFY=false\n")
            
        except Exception as e:
            print(f"Error checking {relay_url}: {str(e)}")
        finally:
            try:
                relay_manager.close_connections()
            except:
                pass
    
    return False

def main():
    # Get inputs from environment variables
    event_id = os.environ.get('INPUT_EVENTID') or os.environ.get('EVENT_ID')
    if not event_id:
        print("Error: Missing required inputs (eventId)")
        sys.exit(1)

    relays = os.environ.get('INPUT_RELAYS', '').split(',')
    if not relays or not relays[0]:
        print("Error: Missing required inputs (relays)")
        sys.exit(1)
    
    if not event_id or not relays:
        print("::error::Missing required inputs (eventId or relays)")
        sys.exit(1)
    
    # Verify event
    success = verify_event_on_relays(event_id, relays)
    
    # Set output
    with open(os.environ['GITHUB_OUTPUT'], 'a') as fh:
        print(f"found={'true' if success else 'false'}", file=fh)
    
    if not success:
        print("::error::Event not found on any relay")
        sys.exit(1)

if __name__ == "__main__":
    main()
