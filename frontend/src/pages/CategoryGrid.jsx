import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCategories, getProviders } from "../api";
import { getCategoryMeta } from "../categoryData";
import Skeleton from "../components/Skeleton";
import StarRating from "../components/StarRating";
import Icon from "../components/Icon";

export default function CategoryGrid() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingProvs, setLoadingProvs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    getCategories()
      .then(cats => {
        setCategories(cats);
        const queryCat = searchParams.get("selected");
        if (queryCat) {
          const match = cats.find(c => c.name.toLowerCase() === queryCat.toLowerCase());
          if (match) selectCategory(match);
        }
      })
      .finally(() => setLoadingCats(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectCategory(cat) {
    if (selected?.id === cat.id) {
      setSelected(null);
      setProviders([]);
      setSearchParams({});
      return;
    }
    setSelected(cat);
    setSearchParams({ selected: cat.name });
    setLoadingProvs(true);
    try {
      const data = await getProviders(cat.name);
      setProviders(data);
    } finally {
      setLoadingProvs(false);
    }
  }

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase();
    return categories.filter(c => c.name.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  return (
    <div className="container" style={{ padding: "var(--sp-10) var(--sp-4)" }}>
      {/* Header & Search */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "var(--sp-4)", marginBottom: "var(--sp-8)" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--a-500)", fontSize: 12, fontWeight: 700, marginBottom: "var(--sp-1)" }}>
            <Icon name="sparkles" size={14} />
            <span>VERIFIED SERVICE DIRECTORY</span>
          </div>
          <h1 style={{ fontSize: "var(--text-3xl)", fontWeight: 800 }}>Explore Home Services</h1>
          <p className="text-muted" style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>
            Select a category to view matched certified professionals in Dhaka.
          </p>
        </div>

        <div style={{ position: "relative", minWidth: 260 }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search service e.g. AC, plumbing..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 38, height: 42, borderRadius: "var(--r-full)" }}
          />
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
            <Icon name="search" size={16} />
          </div>
        </div>
      </div>

      {/* Categories Grid */}
      {loadingCats ? (
        <div className="category-grid">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="category-card">
              <Skeleton height={56} width={56} borderRadius="var(--r-md)" style={{ margin: "0 auto var(--sp-3)" }} />
              <Skeleton height={16} width="75%" style={{ margin: "0 auto var(--sp-2)" }} />
              <Skeleton height={12} width="50%" style={{ margin: "0 auto" }} />
            </div>
          ))}
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="empty-state">
          <Icon name="search" size={40} color="var(--text-muted)" />
          <p>No services match &ldquo;{searchQuery}&rdquo;</p>
          <button className="btn btn-secondary btn-sm" onClick={() => setSearchQuery("")}>
            Clear search filter
          </button>
        </div>
      ) : (
        <div className="category-grid">
          {filteredCategories.map(cat => {
            const meta = getCategoryMeta(cat.name);
            const isActive = selected?.id === cat.id;
            return (
              <button
                key={cat.id}
                className={`category-card${isActive ? " active" : ""}`}
                onClick={() => selectCategory(cat)}
                aria-pressed={isActive}
              >
                <div
                  className="category-icon-wrap"
                  style={{
                    background: meta.accentSubtle,
                    color: meta.accent,
                  }}
                >
                  <span>{meta.emoji}</span>
                </div>
                <span className="category-name">{cat.name}</span>
                <span className="category-meta">{cat.provider_count ?? 3} active pros</span>
                <span className="category-price-badge">
                  From ৳{cat.starting_price ?? 450}/hr
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Category Provider List */}
      {selected && (
        <div style={{ marginTop: "var(--sp-12)", animation: "fade-in 200ms var(--ease)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--sp-6)",
              paddingBottom: "var(--sp-4)",
              borderBottom: "1px solid var(--border)",
              flexWrap: "wrap",
              gap: "var(--sp-4)",
            }}
          >
            <div>
              <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800 }}>
                {selected.name} Providers
              </h2>
              <p className="text-muted" style={{ fontSize: "var(--text-sm)" }}>
                Showing available certified experts ready for direct booking
              </p>
            </div>
            <Link
              to={`/book?category=${encodeURIComponent(selected.name)}`}
              className="btn btn-primary"
              style={{ gap: 6 }}
            >
              <span>Book in this category</span>
              <Icon name="arrow-right" size={16} />
            </Link>
          </div>

          {loadingProvs ? (
            <div className="provider-grid">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="card" style={{ padding: "var(--sp-6)" }}>
                  <Skeleton height={20} width="60%" style={{ marginBottom: 8 }} />
                  <Skeleton height={14} width="40%" style={{ marginBottom: 16 }} />
                  <Skeleton height={40} width="100%" />
                </div>
              ))}
            </div>
          ) : providers.length === 0 ? (
            <div className="empty-state">
              <Icon name="user-x" size={40} color="var(--text-muted)" />
              <p>No providers available in this category yet.</p>
            </div>
          ) : (
            <div className="provider-grid">
              {providers.map(p => {
                const initial = p.name ? p.name.charAt(0).toUpperCase() : "P";
                return (
                  <div
                    key={p.id}
                    className="card"
                    style={{
                      padding: "var(--sp-6)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      border: "1px solid var(--border)",
                      transition: "all 200ms var(--ease)",
                    }}
                  >
                    <div>
                      {/* Provider Header */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-3)", marginBottom: "var(--sp-3)" }}>
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: "var(--r-md)",
                            background: "linear-gradient(135deg, var(--a-500), hsl(265, 80%, 60%))",
                            color: "#fff",
                            fontWeight: 800,
                            fontSize: 16,
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          {initial}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, lineHeight: 1.35, marginBottom: 4, wordBreak: "break-word" }}>
                            {p.name}
                          </h3>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <StarRating value={p.rating ?? 0} size={13} />
                              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--warning)" }}>
                                {p.rating ? p.rating.toFixed(1) : "New"}
                              </span>
                              {p.rating_count > 0 && (
                                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                                  ({p.rating_count})
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: "var(--text-xs)", fontWeight: 800, color: "var(--a-600)", background: "var(--a-50)", padding: "2px 8px", borderRadius: "var(--r-full)", border: "1px solid var(--a-200)" }}>
                              ৳{p.price}/hr
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bio */}
                      {p.bio && (
                        <p
                          className="text-muted"
                          style={{
                            fontSize: "var(--text-sm)",
                            lineHeight: 1.5,
                            marginBottom: "var(--sp-3)",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {p.bio}
                        </p>
                      )}

                      {/* Expertise Tags */}
                      {p.expertise_tags?.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-1)", marginBottom: "var(--sp-4)" }}>
                          {p.expertise_tags.slice(0, 4).map(tag => (
                            <span
                              key={tag}
                              style={{
                                fontSize: 11,
                                padding: "2px 8px",
                                borderRadius: "var(--r-full)",
                                background: "var(--accent-subtle)",
                                color: "var(--accent)",
                                fontWeight: 500,
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action */}
                    <div style={{ paddingTop: "var(--sp-3)", borderTop: "1px solid var(--border)" }}>
                      <Link
                        to={`/book?category=${encodeURIComponent(selected.name)}&provider_id=${p.id}`}
                        className="btn btn-secondary btn-sm btn-full"
                        style={{ justifyContent: "center", fontWeight: 600, gap: 6 }}
                      >
                        Book {p.name} <Icon name="arrow-right" size={13} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
