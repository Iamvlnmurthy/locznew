"""Pins the near-duplicate detector against a real failure: four outlets' headlines on one
Rs 7 lakh Hyderabad cosmetics raid (2 Oct 2026) scored only 0.13-0.45 similarity on title, dek,
AND body -- all below the original 0.5 title-only bar -- so all four posted as separate stories.
A shared concrete rupee figure, corroborated by weak textual overlap, is what actually ties them.
"""
from insert_stories import is_near_duplicate, text_similarity, amount_keys, trigrams


class FakeCursor:
    """Replays canned rows for the two SELECTs is_near_duplicate() issues, so this needs no
    real database. Relies on the function's fixed call order: fetchone() always follows the
    title-similarity query, fetchall() always follows the city-scoped one."""

    def __init__(self, title_hit, same_city_rows):
        self._title_hit = title_hit
        self._same_city_rows = same_city_rows

    def execute(self, sql, params=None):
        pass

    def fetchone(self):
        return (1,) if self._title_hit else None

    def fetchall(self):
        return self._same_city_rows


REAL_HEADLINES = [
    (
        "Cosmetics Raid Seizes Millions in Unauthorised Imports",
        "Local authorities seize counterfeit and unauthorised cosmetic products worth ₹7 lakh from shops in Hyderabad.",
        "In a joint operation, officials from the Commissioner's Task Force and the CDSCO seized nearly ₹7 lakh worth of cosmetics from three shops in Hyderabad.",
    ),
    (
        "Task Force Seizes Rs 7 Lakh Worth of Unauthorised Cosmetics in Raids",
        "A task force, in collaboration with CDSCO, raided three shops in Rajendranagar, seizing unauthorised cosmetic products suspected of being imported from Pakistan.",
        "The Task Force (Rajendranagar Zone), in coordination with CDSCO, conducted raids at three shops and seized unauthorised cosmetic products valued at around Rs 7 lakh.",
    ),
    (
        "Task Force Raids Nampally Shops for Unlicensed and Illegally Labeled Cosmetics",
        "Law enforcement conducts raids in Habeebnagar, seizing goods and checking licenses.",
        "Hyderabad Task Force units from Rajendranagar, Shamshabad, and Golconda conducted raids on cosmetics shops near Nampally Government Hospital in Habeebnagar.",
    ),
]


def test_catches_the_real_four_outlet_duplicate_even_though_no_single_field_crosses_0_5():
    title, dek, body = REAL_HEADLINES[1]
    same_city_candidates = [(t, d, b) for t, d, b in [REAL_HEADLINES[0], REAL_HEADLINES[2]]]

    cur = FakeCursor(title_hit=False, same_city_rows=same_city_candidates)
    assert is_near_duplicate(cur, title, dek, body, city="Hyderabad") is True


def test_does_not_flag_a_different_story_that_shares_only_a_coincidental_round_amount():
    cur = FakeCursor(
        title_hit=False,
        same_city_rows=[
            (
                "Farmer Protest Blocks Highway Over Rs 7 Lakh Compensation Demand",
                "Farmers demand Rs 7 lakh compensation per acre for land acquired for the highway project.",
                "Hundreds of farmers blocked the national highway on Thursday demanding Rs 7 lakh per acre compensation for land taken for the new expressway project.",
            )
        ],
    )
    assert (
        is_near_duplicate(
            cur,
            "Task Force Seizes Rs 7 Lakh Worth of Unauthorised Cosmetics in Raids",
            "A task force raided three shops seizing unauthorised cosmetic products.",
            "The Task Force conducted raids at three shops and seized unauthorised cosmetic products.",
            city="Hyderabad",
        )
        is False
    )


def test_still_catches_a_near_identical_headline_via_the_original_check():
    cur = FakeCursor(title_hit=True, same_city_rows=[])
    assert is_near_duplicate(cur, "Any title", "", "", city="") is True


def test_no_amount_and_no_title_hit_means_not_a_duplicate():
    cur = FakeCursor(title_hit=False, same_city_rows=[])
    assert is_near_duplicate(cur, "A completely unrelated local story", "", "", city="Hyderabad") is False


def test_amount_keys_normalizes_currency_symbol_and_rs_spelling_the_same_way():
    assert amount_keys("worth ₹7 lakh from shops") == {"7lakh"}
    assert amount_keys("valued at around Rs 7 lakh, on Wednesday") == {"7lakh"}
    assert amount_keys("worth millions in unauthorised imports") == set()


def test_trigram_similarity_is_symmetric_and_bounded():
    a, b = REAL_HEADLINES[0][0], REAL_HEADLINES[1][0]
    assert text_similarity(a, b) == text_similarity(b, a)
    assert 0.0 <= text_similarity(a, b) <= 1.0
    assert text_similarity(a, a) == 1.0


def test_empty_strings_have_no_trigrams():
    assert trigrams("") == set()
    assert text_similarity("", "anything") == 0.0
