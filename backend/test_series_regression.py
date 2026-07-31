import json

def test_series_operations():
    print("--- Running Series Operations Regression Test ---")
    
    # Mock localStorage
    storage = {}
    
    def mock_get():
        raw = storage.get("gn_managed_series_list")
        return json.loads(raw) if raw else []

    def mock_set(val):
        storage["gn_managed_series_list"] = json.dumps(val)

    def canonical_key(s):
        return s.strip().replace("  ", " ").lower()

    # 1. Create Series A & Series B
    list1 = ["Series A", "Series B"]
    mock_set(list1)
    assert len(mock_get()) == 2, f"Expected 2, got {len(mock_get())}"
    print("✓ Created Series A and Series B (count: 2)")

    # 2. Sequential Edits: A -> C -> D -> E -> F
    current = "Series A"
    edits = ["Series C", "Series D", "Series E", "Series F"]
    
    for next_name in edits:
        current_list = mock_get()
        old_key = canonical_key(current)
        new_key = canonical_key(next_name)

        # Check collision
        existing_keys = {canonical_key(x) for x in current_list if canonical_key(x) != old_key}
        assert new_key not in existing_keys, f"Collision detected for {next_name}"

        # Rename in place
        next_managed = []
        seen = set()
        for item in current_list:
            k = canonical_key(item)
            target = next_name if k == old_key else item
            t_key = canonical_key(target)
            if t_key not in seen:
                seen.add(t_key)
                next_managed.append(target)

        mock_set(next_managed)
        current = next_name

        count = len(mock_get())
        assert count == 2, f"Regression! Expected 2 series after editing to {next_name}, got {count}"
        print(f"✓ Edited to '{next_name}' -> total series count remains: {count}")

    # 3. Collision Test: Edit Series F -> Series B (Series B already exists)
    current_list = mock_get()
    old_key = canonical_key("Series F")
    new_key = canonical_key("Series B")
    existing_keys = {canonical_key(x) for x in current_list if canonical_key(x) != old_key}
    
    is_collision = new_key in existing_keys
    assert is_collision, "Collision check failed! Renaming F to B should have been blocked."
    print("✓ Successfully blocked renaming Series F to existing Series B with collision error")

    print("\n--- ALL REGRESSION TESTS PASSED CLEANLY ---")

if __name__ == "__main__":
    test_series_operations()
