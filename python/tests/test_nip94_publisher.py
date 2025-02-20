import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pytest
import json
import time
from nostr.event import Event
from nostr.key import PrivateKey
from nostr.relay_manager import RelayManager
import ssl
from publish_nip94 import NIP94Publisher

# Test constants
TEST_RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://nostr.mom"]
TEST_PRIVATE_KEY = "0123456789abcdef" * 4  # Example private key, replace with actual test key
TEST_URL = "nostr:example.com/testfile.txt"
TEST_MIME_TYPE = "text/plain"
TEST_FILE_HASH = "f3589ec0d6c14b7080cdaf278c773f7de40e4516013f76796fd304eee93f4120"
TEST_CONTENT = "Test file metadata"

@pytest.fixture
def publisher():
    """Fixture to create a NIP94Publisher instance"""
    return NIP94Publisher(TEST_RELAYS, TEST_PRIVATE_KEY)

def test_publisher_initialization(publisher):
    """Test publisher initialization"""
    assert isinstance(publisher, NIP94Publisher)
    assert len(publisher.relays) == len(TEST_RELAYS)
    assert isinstance(publisher.private_key, PrivateKey)

def test_create_nip94_event(publisher):
    """Test NIP-94 event creation"""
    event = publisher.create_nip94_event(
        url=TEST_URL,
        mime_type=TEST_MIME_TYPE,
        file_hash=TEST_FILE_HASH,
        original_hash=TEST_FILE_HASH,
        content=TEST_CONTENT
    )
    
    assert isinstance(event, Event)
    assert event.kind == 1063
    assert event.content == TEST_CONTENT
    
    # Verify tags
    tags_dict = dict(event.tags)
    assert tags_dict.get("url") == TEST_URL
    assert tags_dict.get("m") == TEST_MIME_TYPE
    assert tags_dict.get("x") == TEST_FILE_HASH
    assert tags_dict.get("ox") == TEST_FILE_HASH

def test_publish_event(publisher):
    """Test event publishing"""
    # Create test event
    event = publisher.create_nip94_event(
        url=TEST_URL,
        mime_type=TEST_MIME_TYPE,
        file_hash=TEST_FILE_HASH,
        original_hash=TEST_FILE_HASH,
        content=TEST_CONTENT
    )
    
    # Publish event
    results = publisher.publish_event(event)
    
    # Verify results
    assert isinstance(results, dict)
    assert len(results) == len(TEST_RELAYS)
    
    # Check if at least one relay succeeded
    assert any(results.values()), "Failed to publish to any relay"

def test_event_verification():
    """Test if published event can be retrieved from relays"""
    publisher = NIP94Publisher(TEST_RELAYS, TEST_PRIVATE_KEY)
    
    # Create and publish event
    event = publisher.create_nip94_event(
        url=TEST_URL,
        mime_type=TEST_MIME_TYPE,
        file_hash=TEST_FILE_HASH,
        original_hash=TEST_FILE_HASH,
        content=TEST_CONTENT
    )
    
    results = publisher.publish_event(event)
    
    # Wait for event propagation
    time.sleep(2)
    
    # Try to retrieve event from each relay
    event_found = False
    for relay_url in TEST_RELAYS:
        try:
            relay_manager = RelayManager()
            relay_manager.add_relay(relay_url)
            
            # Open connection with SSL verification disabled
            relay_manager.open_connections({"cert_reqs": ssl.CERT_NONE})
            time.sleep(1)  # Wait for connection
            
            # Create subscription filter
            filters = [{
                "ids": [event.id],
                "kinds": [1063]
            }]
            
            # Subscribe and wait for messages
            subscription_id = "verify_" + event.id[:8]
            relay_manager.add_subscription(subscription_id, filters)
            time.sleep(2)  # Wait for response
            
            # Check received messages
            messages = relay_manager.message_pool.messages
            for msg in messages:
                if isinstance(msg, list) and len(msg) > 2 and msg[0] == "EVENT":
                    received_event = msg[2]
                    if received_event.get("id") == event.id:
                        event_found = True
                        break
            
            relay_manager.close_connections()
            
            if event_found:
                break
                
        except Exception as e:
            print(f"Error verifying event on {relay_url}: {e}")
            continue
    
    assert event_found, "Published event could not be retrieved from any relay"
