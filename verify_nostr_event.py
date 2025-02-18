# verify_nostr_event.py
from nostr.relay_manager import RelayManager
from nostr.filter import Filter, Filters
from nostr.event import EventKind
from nostr.key import PrivateKey
import time
import os
import sys

def verify_event():
    relay_urls = os.getenv('RELAYS').split(',')
    target_event_id = os.getenv('EVENT_ID')
    expected_content = os.getenv('EXPECTED_CONTENT')

    relay_manager = RelayManager()
    for relay in relay_urls:
        relay_manager.add_relay(relay)

    # Create filter for specific event ID
    event_filter = Filter(event_ids=[target_event_id], kinds=[EventKind.FILE_METADATA])
    filters = Filters([event_filter])
    
    relay_manager.add_subscription(id="verify-sub", filters=filters)
    relay_manager.run_sync()
    time.sleep(5)  # Allow time for relay responses

    event_found = False
    content_matches = False
    
    while relay_manager.message_pool.has_events():
        event_msg = relay_manager.message_pool.get_event()
        if event_msg.event.id == target_event_id:
            event_found = True
            content_matches = (event_msg.event.content == expected_content)
            break

    if not event_found:
        print("❌ Event not found on any relays")
        sys.exit(1)
    elif not content_matches:
        print("❌ Event content doesn't match expected")
        sys.exit(1)
    else:
        print("✅ Verification successful - Event exists with correct content")
        sys.exit(0)

if __name__ == "__main__":
    verify_event()
