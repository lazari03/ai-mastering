"""Blind A/B ballots: unblinding, validation and the evidence threshold."""

import json

from benchmark import blind_ab

KEY = {f"t{i:02d}": {"A": "mix", "B": "auralith", "C": "human"} for i in range(16)}


def _ballot(listener, ranking, tracks=KEY):
    return {"listener": listener, "tracks": {t: {"ranking": ranking} for t in tracks}}


def test_unblinds_against_the_key_and_counts_pairwise_preference():
    r = blind_ab.tally(KEY, [_ballot("a", ["B", "C", "A"]), _ballot("b", ["C", "B", "A"]), _ballot("c", ["B", "A", "C"])])
    assert r["status"] == "complete" and r["tracks_ranked"] == 16 and r["judgements"] == 48
    assert r["subject_vs"]["human"] == {"wins": 32, "losses": 16, "sign_test_p": r["subject_vs"]["human"]["sign_test_p"]}
    assert r["subject_vs"]["mix"]["wins"] == 48 and r["subject_vs"]["mix"]["sign_test_p"] < 0.001
    assert r["first_place"] == {"auralith": 32, "human": 16}


def test_too_few_listeners_or_tracks_is_pending_and_says_why():
    r = blind_ab.tally(KEY, [_ballot("a", ["B", "C", "A"]), _ballot("b", ["B", "C", "A"])])
    assert r["status"] == "pending" and "2 listeners" in r["why_pending"]
    few = {k: KEY[k] for k in list(KEY)[:5]}
    r = blind_ab.tally(few, [_ballot(x, ["B", "C", "A"], few) for x in "abc"])
    assert r["status"] == "pending" and "5 tracks" in r["why_pending"]
    assert "no quality claim" in blind_ab.render_md(r)


def test_malformed_ballots_are_rejected_not_counted():
    bad = _ballot("x", ["B", "B", "A"])
    r = blind_ab.tally(KEY, [bad])
    assert r["judgements"] == 0 and r["rejected_ballots"][0]["listener"] == "x"


def test_no_ballots_is_pending_with_empty_tables():
    r = blind_ab.tally(KEY, [])
    assert r["status"] == "pending" and r["subject_vs"] == {} and r["judgements"] == 0


def test_template_hides_names_and_round_trips(tmp_path):
    (tmp_path / "listening_key.json").write_text(json.dumps(KEY))
    assert blind_ab.main(["template", str(tmp_path), "--listener", "dana"]) == 0
    ballot = json.loads((tmp_path / "ballots" / "dana.json").read_text())
    assert "auralith" not in json.dumps(ballot)
    for entry in ballot["tracks"].values():
        entry["ranking"] = ["B", "A", "C"]
    (tmp_path / "ballots" / "dana.json").write_text(json.dumps(ballot))
    assert blind_ab.main(["tally", str(tmp_path)]) == 0
    assert json.loads((tmp_path / "preference.json").read_text())["judgements"] == 16
