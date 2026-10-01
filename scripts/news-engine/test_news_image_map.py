"""Pins real relevance failures found reviewing live news_stories output (2 Oct 2026).

Each case here was a genuine wrong-or-generic image on a live published story, not a
hypothetical. Keep adding to this list whenever a live mismatch is found and fixed --
that is the only way this keyword list stays honest about what it actually covers.
"""
import news_image_map as nim


def test_health_research_headline_matches_hospital_topic():
    # Was falling through to a generic category image: "deficiency"/"study" weren't
    # recognised as health vocabulary, only clinical/outbreak terms were.
    assert nim.topic_of("Vitamin D Deficiency Linked to Heart Stress in New Study") == "hospital"


def test_raid_seizure_headlines_match_raid_topic():
    # Was falling through to a generic "local" street-market photo -- the wrong genre of image
    # for a customs/task-force enforcement story, not just a non-ideal one.
    cases = [
        "Task Force Seizes Rs 7 Lakh Worth of Unauthorised Cosmetics in Raids",
        "Cosmetics Raid Seizes Millions in Unauthorised Imports",
        "Task Force Raids Nampally Shops for Unlicensed and Illegally Labeled Cosmetics",
    ]
    for title in cases:
        assert nim.topic_of(title) == "raid", title


def test_narcotics_and_weapon_headlines_still_win_over_the_generic_raid_topic():
    # "raid" sits after drugs/weapon in TOPIC_MAP precisely so a specific match isn't swallowed
    # by the generic one -- these must still resolve to their own, more specific topic.
    assert nim.topic_of("Police raid seizes ganja worth Rs 2 lakh") == "drugs"
    assert nim.topic_of("Raid recovers seized firearms cache near border") == "weapon"


def test_previously_correct_matches_still_hold():
    cases = [
        ("Police Step Up Efforts to Curb Harassment in Hyderabad", "assault"),
        ("New Travel Pass Launches Friday for Metro and Buses", "metro"),
        ("Gill and Sharma Power India Past West Indies in Thrilling ODI", "cricket"),
        ("Rourkela Police Arrest Two in Cyber Crime Racket", "arrest"),
        ("BRICS Nations Form New Tax Working Groups to Boost Cooperation", "tax"),
        ("Woman Sexually Assaulted After Posing as Police in Thrissur", "assault"),
        ("HMWS&SB Prepares for Summer Water Supply Challenges", "water"),
        ("Eye Hospital Faces Allegations of Insurance Fraud", "fraud"),
        ("Crop Stress Looms as Kharif Season Ends in Telangana", "farmer"),
        ("Hospital Wins National Award for Innovative Diabetes Treatment", "hospital"),
        ("Historic Koder House Fire Sparks Concern in Fort Kochi", "fire"),
    ]
    for title, expected in cases:
        assert nim.topic_of(title) == expected, title


def test_unrelated_headline_has_no_topic():
    # The control: this must stay None, or the keyword list has gone too broad and will
    # start mismatching things the way "rain" once matched "Ukraine".
    assert nim.topic_of("Vera Vita Living Launches Amaya in Hyderabad") is None
