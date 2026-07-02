package service

import (
	"testing"
)

// ── validMobile ───────────────────────────────────────────────────────────────

func TestValidMobile(t *testing.T) {
	cases := []struct {
		mobile string
		want   bool
	}{
		// valid Sri Lanka mobile format: +947XXXXXXXX (12 chars total)
		{"+94771234567", true},
		{"+94701234567", true},
		{"+94751234567", true},
		// wrong prefix
		{"+94671234567", false}, // digit after +947 must be [0-9] — actually wait: +947 is required, then 8 digits
		{"+9477123456", false},  // too short (11 chars)
		{"+947712345678", false}, // too long (13 chars)
		{"+94771234abc", false},  // non-digit
		{"0771234567", false},    // no country code
		{"", false},
		{"+947", false},
	}

	for _, tc := range cases {
		got := validMobile(tc.mobile)
		if got != tc.want {
			t.Errorf("validMobile(%q) = %v, want %v", tc.mobile, got, tc.want)
		}
	}
}

// ── distKey (papers service helper) ──────────────────────────────────────────

func TestDistKey(t *testing.T) {
	// Imported from papers.go but in same package
	cases := []struct{ in, want string }{
		{"", "all"},
		{"Colombo", "Colombo"},
		{"Galle", "Galle"},
	}
	for _, tc := range cases {
		got := distKey(tc.in)
		if got != tc.want {
			t.Errorf("distKey(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
