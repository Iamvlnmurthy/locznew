"""Businesses whose own name contradicts the category they are filed under.

Found by accident: "Ladies Hostel 5" sat in *Lodging services*, so the page told a
woman looking for a hostel that people come there for "best hotel, budget hotel,
family hotel". The name said what it was; the category said something else, and
everything downstream — keywords, banner, title, the sentence a reader actually
reads — inherited the wrong answer.

That was 2,811 hostels. This looks for the same fault everywhere else.

The signal is deliberately narrow. A business called "X Medicals" is a pharmacy;
one called "X Enterprises" could be anything, so it is not here. Each rule needs a
word that names a trade rather than describing one, and a target category that
already exists in the directory.

Two guards do most of the work:

  - if the current category *already* matches the signal, nothing is wrong.
    "Sri Krishna Medicals" in "Medical shops" is correct and must not move.
  - a name matching two different signals is skipped, not guessed. "Hotel
    Saravana Bhavan Restaurant" is genuinely both, and picking one is a coin toss.

    python scripts/business-enrichment/name_category_audit.py         # report
    python scripts/business-enrichment/name_category_audit.py apply
"""

import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _db  # noqa: E402

_db.utf8_stdout()
APPLY = "apply" in sys.argv
BATCH = 500

# (regex on the name, words that mean the current category is already right, target category)
#
# Word boundaries are \y, not : PostgreSQL's POSIX regex reads  as a backspace
# character, so a pattern written with  silently matches nothing. The first run of
# this audit reported zero mismatches across the entire directory for that reason,
# which is a reminder that "no results" deserves the same suspicion as a bad result.
#
# The middle column is what stops a correct record being moved: a shop called
# "X Dental Care" filed under "Dental clinics & tooth care centres" matches the
# first column, and the second recognises that as already correct.
RULES = [
    (r"\y(medicals|pharmacy|chemist|drug ?store|druggist)\y",
     ("medical", "pharmac", "chemist", "drug"), "Medical shops"),
    (r"\y(dental|dentist|dentistry|tooth care)\y",
     ("dental", "dentist", "tooth"), "Dental clinics"),
    (r"\y(hospital|hospitals|nursing home)\y",
     ("hospital", "nursing"), "Hospitals"),
    (r"\y(diagnostic|diagnostics|patholog|scan centre|scan center|labs?)\y",
     ("diagnostic", "patholog", "lab"), "Diagnostic labs & imaging"),
    (r"\y(opticals?|optician|optometry|eye care)\y",
     ("optic", "eye"), "Opticians & eyewear"),
    (r"\y(school|vidyalaya|vidhyalaya|high school)\y",
     ("school", "vidyalaya", "education"), "Schools"),
    (r"\y(college|university|institute of technology|polytechnic)\y",
     ("college", "universit", "polytechnic"), "Colleges"),
    (r"\y(bakery|bakers|bake house)\y",
     ("baker", "sweet", "cake"), "Bakeries & sweets"),
    (r"\y(restaurant|dhaba|biryani|tiffins?|mess|family restaurant)\y",
     ("restaurant", "food", "dhaba", "biryani", "cafe", "tiffin", "mess"), "Restaurants & food"),
    (r"\y(salon|saloon|parlour|parlor|beauty parlour|hair studio)\y",
     ("salon", "beauty", "parlour", "spa", "hair"), "Beauty salons"),
    (r"\y(jewellers?|jewellery|jewelry|gold ?smith)\y",
     ("jewel", "gold"), "Jewellery stores"),
    (r"\y(tailors?|tailoring|boutique)\y",
     ("tailor", "boutique", "cloth", "fashion"), "Tailoring & boutiques"),
    (r"\y(hardware|sanitary|plywood|paints?)\y",
     ("hardware", "sanitary", "paint", "building", "plywood"), "Hardware shops"),
    (r"\y(petrol pump|petrol bunk|filling station|fuel station|hp petrol|iocl|bharat petroleum)\y",
     ("petrol", "fuel", "gas station"), "Petrol pumps"),
    (r"\y(temple|devalayam|mandir|masjid|mosque|church|gurudwara)\y",
     ("temple", "worship", "mosque", "church", "religio"), "Places of worship"),
    (r"\y(gym|gymnasium|fitness|crossfit)\y",
     ("gym", "fitness", "health club"), "Gyms & fitness centres"),
    (r"\y(travels?|tours and travels|tour operator)\y",
     ("travel", "tour"), "Travel agencies"),
    (r"\y(motors|automobiles?|auto ?mobile|car care)\y",
     ("auto", "car", "motor", "vehicle"), "Automobile services"),
    (r"\y(electricals?|electronics)\y",
     ("electric", "electronic", "appliance"), "Electronics stores"),
    (r"\y(stationery|stationers|xerox)\y",
     ("stationer", "printing", "book"), "Printing & stationery"),
    (r"\y(sweets|mithai|sweet ?house)\y",
     ("sweet", "baker", "confection"), "Bakeries & sweets"),
    (r"\y(bank|atm)\y",
     ("bank", "atm", "financ", "credit"), "Banks & ATMs"),
    (r"\y(super ?market|supermarket|kirana|provisions?|general ?stores?)\y",
     ("grocer", "kirana", "supermarket", "provision", "general"), "Grocery & kirana"),
]


def main():
    conn = _db.connect(statement_timeout="600s", work_mem="64MB", autocommit=APPLY)
    cur = conn.cursor()

    cur.execute("SELECT id, name, \"searchTerms\" FROM categories")
    cats = {n: (i, list(t or [])) for i, n, t in cur.fetchall()}

    report, moved_total = [], 0
    for pattern, already_ok, target_name in RULES:
        target = cats.get(target_name)
        if not target:
            report.append(f"  SKIP  no category named {target_name!r}")
            continue
        target_id, target_terms = target

        # Candidates: the name matches, and the current category does not already
        # cover it. Also excludes anything matching a second rule's word, because a
        # "Hotel ... Restaurant" is genuinely both and guessing is worse than leaving.
        others = [p for p, _, _ in RULES if p != pattern]
        cur.execute(
            f"""
            SELECT b.id, b."categoryId", b.name, c.name
            FROM businesses b
            JOIN categories c ON c.id = b."categoryId"
            WHERE b."deletedAt" IS NULL AND b."isActive" AND b."ownerId" IS NULL
              AND b.name ~* %s
              AND NOT ({' OR '.join(['lower(c.name) LIKE %s'] * len(already_ok))})
              AND (SELECT count(*) FROM unnest(ARRAY[{','.join(['%s'] * len(others))}]::text[]) AS o
                   WHERE b.name ~* o) = 0
            """,
            (pattern, *[f"%{w}%" for w in already_ok], *others),
        )
        rows = cur.fetchall()
        if not rows:
            continue

        sample = ", ".join(f"{n[:26]} [{c}]" for _, _, n, c in rows[:3])
        report.append(f"  {len(rows):>6,}  -> {target_name:<32} e.g. {sample}")

        if APPLY:
            kw = target_terms[:10]
            for i in range(0, len(rows), BATCH):
                chunk = rows[i : i + BATCH]
                cur.executemany(
                    """INSERT INTO category_promotion_log (business_id, from_id, to_id)
                       VALUES (%s,%s,%s) ON CONFLICT (business_id) DO NOTHING""",
                    [(r[0], r[1], target_id) for r in chunk],
                )
                cur.executemany(
                    'UPDATE businesses SET "categoryId"=%s, keywords=%s, "updatedAt"=now() '
                    "WHERE id=%s",
                    [(target_id, kw, r[0]) for r in chunk],
                )
            moved_total += len(rows)

    text = "\n".join(
        ["businesses whose name contradicts their category", ""]
        + report
        + [
            "",
            f"{'MOVED' if APPLY else 'would move'}: {moved_total if APPLY else 'see counts above'}",
            "",
            "Names matching two rules were skipped, not guessed. Claimed businesses",
            "were never touched. Every move is in category_promotion_log and reverses",
            'with: UPDATE businesses b SET "categoryId" = l.from_id',
            "       FROM category_promotion_log l WHERE l.business_id = b.id;",
        ]
    )
    print(text)
    io.open("var/name_category_audit.txt", "w", encoding="utf-8").write(text + "\n")
    conn.close()


if __name__ == "__main__":
    main()
