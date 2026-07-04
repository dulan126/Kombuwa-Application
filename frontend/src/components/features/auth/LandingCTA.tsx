'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';

export function LandingCTA() {
  const { isLoggedIn } = useAuth();

  if (isLoggedIn) {
    return (
      <Link href="/papers">
        <Button variant="primary" size="lg">📋 ප්‍රශ්න පත්‍ර</Button>
      </Link>
    );
  }

  return (
    <Link href="/register">
      <Button variant="primary" size="lg">ලියාපදිංචිය</Button>
    </Link>
  );
}
