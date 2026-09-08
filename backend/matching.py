"""
Smart provider matching.

Score
-----
    match_score = w_availability · availability
                + w_distance     · distance
                + w_rating       · rating
                + w_price        · price
                + w_expertise    · expertise
                + w_workload     · workload

Every sub-score is normalised to [0, 1] and the weights sum to 1.0, so the
final score is directly comparable across requests.

**The weights shift with urgency.** For a normal booking price carries real
weight; for an emergency the customer wants whoever is nearest and least busy,
and cares much less what it costs. Encoding that in the weights — rather than
bolting a special case onto the sort — is what makes the ranking feel correct
in both situations.

Complexity
----------
    filter  O(n) over all providers
    score   O(1) per candidate
    sort    O(m log m) over the m candidates that survive the filter
    space   O(m)

For a hackathon-scale provider list (tens to low hundreds) a heap-based top-k
would be slower in practice than sorting, so this stays a plain sort.
"""

import math

from scheduling import free_slots_for_provider, has_free_slot, open_job_count

# Distance beyond which a provider scores 0 for proximity.
MAX_DISTANCE_KM = 20.0
# Emergencies widen the net — a slightly farther technician beats no technician.
EMERGENCY_DISTANCE_KM = 30.0

# Open jobs at which the workload score bottoms out.
WORKLOAD_SATURATION = 5

# Unique feature: dynamic pricing.
URGENCY_MULTIPLIERS = {"Normal": 1.0, "Urgent": 1.15, "Emergency": 1.30}

# Unique feature: urgency-aware scoring weights.
WEIGHTS_BY_URGENCY = {
    "Normal": {
        "availability": 0.20,
        "distance": 0.18,
        "rating": 0.24,
        "price": 0.18,
        "expertise": 0.12,
        "workload": 0.08,
    },
    "Urgent": {
        "availability": 0.22,
        "distance": 0.24,
        "rating": 0.20,
        "price": 0.10,
        "expertise": 0.12,
        "workload": 0.12,
    },
    "Emergency": {
        "availability": 0.22,
        "distance": 0.30,
        "rating": 0.16,
        "price": 0.04,
        "expertise": 0.12,
        "workload": 0.16,
    },
}

# Unique feature: urgency auto-detection from free text.
EMERGENCY_KEYWORDS = [
    "fire", "flood", "gas leak", "sparking", "spark", "smoke", "explosion",
    "burst", "electric shock", "shock", "short circuit", "emergency", "flooded",
]
URGENT_KEYWORDS = [
    "urgent", "asap", "immediately", "right now", "today", "not working",
    "stopped working", "leaking", "leak", "overflow", "stuck", "dangerous",
    "no water", "no power",
]

# Average city speed used for the arrival estimate (km/h).
AVERAGE_SPEED_KMH = 22.0
BASE_DISPATCH_MINUTES = 12


def haversine_km(loc1: dict, loc2: dict) -> float:
    """
    Great-circle distance between two {lat, lng} points, in kilometres.

    Complexity: O(1).
    """
    radius_km = 6371.0
    lat1, lat2 = math.radians(loc1["lat"]), math.radians(loc2["lat"])
    dlat = math.radians(loc2["lat"] - loc1["lat"])
    dlng = math.radians(loc2["lng"] - loc1["lng"])

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def detect_urgency(problem_details: str) -> str | None:
    """
    Suggest an urgency level from the customer's own words, or None if the text
    gives no signal. Emergency keywords win over merely urgent ones.

    Complexity: O(k · len(text)).
    """
    if not problem_details:
        return None
    text = problem_details.lower()

    if any(keyword in text for keyword in EMERGENCY_KEYWORDS):
        return "Emergency"
    if any(keyword in text for keyword in URGENT_KEYWORDS):
        return "Urgent"
    return None


def get_dynamic_price(base_price: int, urgency: str) -> int:
    """Apply the urgency multiplier. Complexity: O(1)."""
    return int(round(base_price * URGENCY_MULTIPLIERS.get(urgency, 1.0)))


def estimate_eta_minutes(distance_km: float, urgency: str) -> int:
    """
    Rough arrival estimate: fixed dispatch overhead plus travel time, trimmed
    for urgent jobs because they jump the provider's queue.

    Complexity: O(1).
    """
    travel = (distance_km / AVERAGE_SPEED_KMH) * 60
    dispatch = BASE_DISPATCH_MINUTES if urgency == "Normal" else BASE_DISPATCH_MINUTES // 2
    return max(5, int(round(travel + dispatch)))


def _expertise_score(provider, service_type: str, problem_details: str) -> float:
    """
    1.0 when a tag matches the customer's problem text, 0.85 when the tag set
    merely lines up with the category, 0.6 for a category-only match.

    Complexity: O(t) over the provider's tags.
    """
    tags = [str(tag).lower() for tag in (provider.expertise_tags or [])]
    if not tags:
        return 0.6

    problem = (problem_details or "").lower()
    for tag in tags:
        # "ac_repair" should match the phrase "ac repair" typed by a human.
        if tag.replace("_", " ") in problem:
            return 1.0

    normalised_category = service_type.lower().replace(" & ", " ").replace(" ", "_")
    if any(tag in normalised_category or normalised_category in tag for tag in tags):
        return 0.85

    return 0.6


def compute_match_score(
    provider,
    request_location: dict,
    service_type: str,
    urgency: str,
    problem_details: str,
    pool_min_price: int,
    pool_max_price: int,
) -> dict:
    """
    Score one provider against one request and return the full breakdown, so
    the UI can show *why* a provider was recommended instead of just a number.

    Complexity: O(1) arithmetic plus O(t) over expertise tags.
    """
    weights = WEIGHTS_BY_URGENCY.get(urgency, WEIGHTS_BY_URGENCY["Normal"])
    max_distance = EMERGENCY_DISTANCE_KM if urgency == "Emergency" else MAX_DISTANCE_KM

    # Availability: candidates are pre-filtered to a free slot, so the question
    # is how much slack they have left that day — more slack, fewer surprises.
    same_day_free = len(free_slots_for_provider(provider, [request_location.get("_date", "")]))
    availability = 1.0 if same_day_free == 0 else min(1.0, 0.7 + 0.1 * same_day_free)

    distance_km = haversine_km(provider.location, request_location)
    distance = max(0.0, 1 - distance_km / max_distance)

    rating = (provider.rating or 0) / 5.0

    price_range = max(1, pool_max_price - pool_min_price)
    price = 1 - (provider.price - pool_min_price) / price_range

    expertise = _expertise_score(provider, service_type, problem_details)

    open_jobs = open_job_count(provider.id)
    workload = max(0.0, 1 - open_jobs / WORKLOAD_SATURATION)

    score = (
        weights["availability"] * availability
        + weights["distance"] * distance
        + weights["rating"] * rating
        + weights["price"] * price
        + weights["expertise"] * expertise
        + weights["workload"] * workload
    )

    return {
        "match_score": round(score, 4),
        "distance_km": round(distance_km, 2),
        "open_jobs": open_jobs,
        "breakdown": {
            "availability": round(availability, 3),
            "distance": round(distance, 3),
            "rating": round(rating, 3),
            "price": round(price, 3),
            "expertise": round(expertise, 3),
            "workload": round(workload, 3),
        },
        "weights": weights,
    }


def _tag_candidates(candidates: list[dict]) -> None:
    """
    Label the standouts — `cheapest`, `best_rated`, `fastest` — so the price
    comparison view can call them out. Mutates each candidate in place.

    Complexity: O(m).
    """
    if not candidates:
        return

    cheapest = min(candidates, key=lambda c: c["estimated_price"])
    best_rated = max(candidates, key=lambda c: c["provider"].rating or 0)
    fastest = min(candidates, key=lambda c: c["eta_minutes"])

    for candidate in candidates:
        candidate["tags"] = []
    cheapest["tags"].append("cheapest")
    best_rated["tags"].append("best_rated")
    fastest["tags"].append("fastest")


def find_best_matches(
    service_type: str,
    location: dict,
    date: str,
    time_slot: str,
    urgency: str,
    providers: list,
    exclude_provider_ids: list[str] | None = None,
    problem_details: str = "",
    top_k: int = 3,
) -> list[dict]:
    """
    Rank providers for one request.

    Steps: filter by category → filter by a genuinely free slot → drop excluded
    providers → score → sort descending → tag the standouts → take top_k.

    For emergencies, ties are broken by shortest ETA rather than arbitrary
    order, so the customer is never handed a slower option at equal score.

    Returns:
        [{provider, match_score, estimated_price, base_price, distance_km,
          eta_minutes, open_jobs, breakdown, weights, tags}, ...]

    Complexity: O(n) filter + O(m log m) sort, O(m) space.
    """
    excluded = set(exclude_provider_ids or [])

    candidates = [
        provider
        for provider in providers
        if provider.service_type == service_type
        and getattr(provider, "status", "approved") == "approved"
        and provider.id not in excluded
        and has_free_slot(provider.id, date, time_slot, provider.available_slots)
    ]
    if not candidates:
        return []

    prices = [provider.price for provider in candidates]
    pool_min, pool_max = min(prices), max(prices)

    # The availability sub-score needs the requested date; pass it alongside the
    # coordinates rather than widening the signature of every helper.
    scoring_location = {**location, "_date": date}

    scored: list[dict] = []
    for provider in candidates:
        detail = compute_match_score(
            provider=provider,
            request_location=scoring_location,
            service_type=service_type,
            urgency=urgency,
            problem_details=problem_details,
            pool_min_price=pool_min,
            pool_max_price=pool_max,
        )
        scored.append(
            {
                "provider": provider,
                "match_score": detail["match_score"],
                "base_price": provider.price,
                "estimated_price": get_dynamic_price(provider.price, urgency),
                "distance_km": detail["distance_km"],
                "eta_minutes": estimate_eta_minutes(detail["distance_km"], urgency),
                "open_jobs": detail["open_jobs"],
                "breakdown": detail["breakdown"],
                "weights": detail["weights"],
                "tags": [],
            }
        )

    scored.sort(key=lambda c: (-c["match_score"], c["eta_minutes"]))
    top = scored[:top_k]
    _tag_candidates(top)
    return top
