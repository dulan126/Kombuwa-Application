import React from 'react';

export function Footer() {
  return (
    <footer className="bg-dark-2 border-t border-border-dim py-8 px-8 text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-[7px] gradient-gold flex items-center justify-center font-bold text-[15px] text-white">
          K
        </div>
        <span className="text-[17px] font-bold text-gold">MIEDVANCE</span>
      </div>
      <p className="text-[11px] text-text-muted">
        © {new Date().getFullYear()} MIEDVANCE.com · ශ්‍රී ලංකාවේ ප්‍රමුඛ අ/පෙළ MCQ, SRP, Q&A වේදිකාව
      </p>
    </footer>
  );
}
