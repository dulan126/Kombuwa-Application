'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';

export function LandingCTA() {
  const router = useRouter();
  const { isLoggedIn, demoLogin } = useAuth();

  const handleDemoLogin = async () => {
    await demoLogin('Demo Student', 'phy', '12', 'Colombo');
    router.push('/papers');
  };

  if (isLoggedIn) {
    return (
      <Link href="/papers">
        <Button variant="primary" size="lg">📋 ප්‍රශ්න පත්‍ර</Button>
      </Link>
    );
  }

  return (
    <div className="flex gap-2.5 justify-center flex-wrap">
      <Link href="/register">
        <Button variant="primary" size="lg">ලියාපදිංචිය</Button>
      </Link>
      <Button variant="outline" size="lg" onClick={handleDemoLogin}>
        Demo — ඇතුල් වන්න
      </Button>
    </div>
  );
}
