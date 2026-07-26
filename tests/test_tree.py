from thicket.tree import compute_depths


def test_top_level_is_depth_zero():
    cs = [{"id": "a", "parent_id": "t3_XX"}]
    assert compute_depths(cs, "XX") == {"a": 0}


def test_nested_replies_increment_depth():
    cs = [{"id": "a", "parent_id": "t3_XX"},
          {"id": "b", "parent_id": "t1_a"},
          {"id": "c", "parent_id": "t1_b"}]
    assert compute_depths(cs, "XX") == {"a": 0, "b": 1, "c": 2}


def test_orphan_with_deleted_parent_is_marked_not_crashed():
    cs = [{"id": "a", "parent_id": "t3_XX"},
          {"id": "z", "parent_id": "t1_missing"}]
    assert compute_depths(cs, "XX") == {"a": 0, "z": -1}


def test_out_of_order_input_still_resolves():
    cs = [{"id": "c", "parent_id": "t1_b"},
          {"id": "b", "parent_id": "t1_a"},
          {"id": "a", "parent_id": "t3_XX"}]
    assert compute_depths(cs, "XX") == {"a": 0, "b": 1, "c": 2}


def test_cycle_does_not_hang():
    cs = [{"id": "a", "parent_id": "t1_b"},
          {"id": "b", "parent_id": "t1_a"}]
    assert compute_depths(cs, "XX") == {"a": -1, "b": -1}
