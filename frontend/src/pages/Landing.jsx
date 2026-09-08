import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getCategories } from "../api";
import { getCategoryMeta } from "../categoryData";
import Icon from "../components/Icon";

const HOW_IT_WORKS = [
  {
    step: "01",
    icon: "search",
    title: "Select Service & Urgency",
    desc: "Choose from 8 specialized categories with customizable urgency (Normal, Urgent, Emergency) and photo upload.",
  },
  {
    step: "02",
    icon: "zap",
    title: "Smart Multi-Factor Matching",
    desc: "Our algorithm ranks verified providers based on availability, GPS distance, rating, pricing, and domain expertise.",
  },
  {
    step: "03",
    icon: "calendar",
    title: "Conflict-Free Scheduling",
    desc: "Automatic double-booking prevention ensures your technician is 100% committed to your chosen time window.",
  },
  {
    step: "04",
    icon: "check-circle",
    title: "Live Milestone Tracking",
    desc: "Track status in real time (Requested ➔ Accepted ➔ On The Way ➔ Arrived ➔ Completed) with automated BDT invoices.",
  },
];

const TRUST_BADGES = [
  { icon: "shield", label: "Verified Pros", desc: "Background-checked & licensed" },
  { icon: "clock", label: "On-Time Guarantee", desc: "Punctual or next service free" },
  { icon: "credit-card", label: "Transparent Pricing", desc: "No hidden fees, upfront BDT rates" },
  { icon: "star", label: "Satisfaction Promise", desc: "4.9★ average customer rating" },
];

export default function Landing() {
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  return (
    <>
      {/* ── Hero Section ──────────────────────────────────────────────── */}
      <section className="hero">
        <div className="container">
          <div className="hero-badge">
            <span className="hero-badge-pill">CSE FEST 2026</span>
            <span>⚡ Smart Home Service Automation Platform</span>
          </div>

          <h1 className="hero-title">
            Home Services,<br />
            <span className="hero-gradient-text">Automated with Intelligence</span>
          </h1>

          <p className="hero-sub">
            Instant multi-factor provider matching, conflict-free scheduling, live status tracking, and transparent BDT pricing — all in one unified portal.
          </p>

          <div className="hero-cta">
            <Link to="/book" className="btn btn-primary btn-lg" style={{ gap: 8 }}>
              <Icon name="plus" size={18} />
              <span>Book a Service</span>
            </Link>
            <Link to="/services" className="btn btn-secondary btn-lg" style={{ gap: 8 }}>
              <Icon name="wrench" size={18} />
              <span>Explore 8 Categories</span>
            </Link>
          </div>

          {/* Live Platform Stats */}
          <div className="hero-stats-banner">
            <div className="hero-stat-item">
              <span className="hero-stat-num" style={{ color: "var(--accent)" }}>15 min</span>
              <span className="hero-stat-label">Avg. Matching ETA</span>
            </div>
            <div className="hero-stat-item">
              <span className="hero-stat-num" style={{ color: "var(--warning)" }}>4.9 ★</span>
              <span className="hero-stat-label">Customer Satisfaction</span>
            </div>
            <div className="hero-stat-item">
              <span className="hero-stat-num" style={{ color: "var(--success)" }}>100%</span>
              <span className="hero-stat-label">Verified Providers</span>
            </div>
            <div className="hero-stat-item">
              <span className="hero-stat-num" style={{ color: "var(--info)" }}>৳450+</span>
              <span className="hero-stat-label">Transparent Rates / hr</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust & Guarantee Badges ──────────────────────────────────── */}
      <section className="trust-section">
        <div className="container">
          <div className="trust-grid">
            {TRUST_BADGES.map((badge, i) => (
              <div key={i} className="trust-card">
                <div className="trust-icon-wrap">
                  <Icon name={badge.icon} size={22} />
                </div>
                <div>
                  <p className="trust-title">{badge.label}</p>
                  <p className="trust-desc">{badge.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8 Service Categories Showcase ─────────────────────────────── */}
      <section style={{ padding: "var(--sp-16) 0" }}>
        <div className="container">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "var(--sp-8)", flexWrap: "wrap", gap: "var(--sp-4)" }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--a-500)", fontSize: 12, fontWeight: 700, marginBottom: "var(--sp-1)" }}>
                <Icon name="wrench" size={14} />
                <span>ON-DEMAND REPAIR & CARE</span>
              </div>
              <h2 style={{ fontSize: "var(--text-3xl)", fontWeight: 800 }}>Explore Our Services</h2>
              <p className="text-muted" style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>
                Trained, background-checked professionals ready to help you at home.
              </p>
            </div>
            <Link to="/services" className="btn btn-secondary" style={{ gap: 6 }}>
              <span>View all providers</span>
              <Icon name="arrow-right" size={14} />
            </Link>
          </div>

          <div className="category-grid">
            {categories.map(cat => {
              const meta = getCategoryMeta(cat.name);
              return (
                <Link
                  key={cat.id}
                  to={`/book?category=${encodeURIComponent(cat.name)}`}
                  className="category-card"
                  title={`Book ${cat.name}`}
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
                  <span className="category-meta">{cat.provider_count ?? 3} pros available</span>
                  <span className="category-price-badge">
                    From ৳{cat.starting_price ?? 450}/hr
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How Smart Automation Works ────────────────────────────────── */}
      <section className="how-section">
        <div className="container">
          <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto var(--sp-10)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--a-500)", fontSize: 12, fontWeight: 700, marginBottom: "var(--sp-1)" }}>
              <Icon name="zap" size={14} />
              <span>THE INTELLIGENT WORKFLOW</span>
            </div>
            <h2 style={{ fontSize: "var(--text-3xl)", fontWeight: 800 }}>How Home Automation Works</h2>
            <p className="text-muted" style={{ fontSize: "var(--text-sm)", marginTop: "var(--sp-1)" }}>
              From intelligent matching algorithms to conflict-free time slots and live status dispatch.
            </p>
          </div>

          <div className="how-grid">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} className="how-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-4)" }}>
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 800, color: "var(--a-500)", letterSpacing: "0.08em" }}>
                    STEP {step.step}
                  </span>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--accent-subtle)", display: "grid", placeItems: "center", color: "var(--accent)" }}>
                    <Icon name={step.icon} size={18} />
                  </div>
                </div>
                <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, marginBottom: "var(--sp-2)", textAlign: "left" }}>
                  {step.title}
                </h3>
                <p className="text-muted" style={{ fontSize: "var(--text-sm)", textAlign: "left", lineHeight: 1.55 }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA & Guarantee Banner ─────────────────────────────── */}
      <section style={{ padding: "var(--sp-16) 0" }}>
        <div className="container">
          <div className="cta-banner">
            <div className="cta-banner-inner">
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.18)", padding: "4px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: "var(--sp-4)" }}>
                <Icon name="shield" size={14} color="#fff" />
                <span>100% SATISFACTION GUARANTEED</span>
              </div>
              <h2 style={{ fontSize: "var(--text-3xl)", fontWeight: 800, marginBottom: "var(--sp-3)" }}>
                Ready to Experience Seamless Home Care?
              </h2>
              <p style={{ opacity: 0.9, fontSize: "var(--text-base)", marginBottom: "var(--sp-8)", lineHeight: 1.6 }}>
                Book an experienced, verified professional in under 60 seconds with live stage updates from start to finish.
              </p>
              <div style={{ display: "flex", gap: "var(--sp-3)", justifyContent: "center", flexWrap: "wrap" }}>
                <Link to="/book" className="btn btn-secondary btn-lg" style={{ color: "var(--a-600)", fontWeight: 700 }}>
                  Book a Service Now
                </Link>
                <Link to="/signup" className="btn btn-ghost btn-lg" style={{ color: "#fff", border: "1px solid rgba(255,255,255,0.4)" }}>
                  Create Free Account
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="site-footer">
        <div className="container">
          <div className="footer-inner">
            <div className="footer-brand">
              <div className="nav-brand-icon" style={{ width: 32, height: 32 }}>
                <Icon name="home" size={16} color="#fff" />
              </div>
              <div>
                <span style={{ fontWeight: 800, fontSize: "var(--text-base)" }}>Home<span style={{ color: "var(--a-500)" }}>Serve</span></span>
                <p className="text-muted" style={{ fontSize: "var(--text-xs)" }}>Smart Home Service Automation</p>
              </div>
            </div>
            <div className="footer-links">
              <Link to="/services" className="footer-link">Services</Link>
              <Link to="/signup" className="footer-link">Sign Up</Link>
              <Link to="/login" className="footer-link">Sign In</Link>
              <Link to="/signup/provider" className="footer-link">Join as Provider</Link>
            </div>
            <p className="footer-copy">
              © 2026 HomeServe · BAUST CSE FEST Hackathon · Built with ❤️
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
