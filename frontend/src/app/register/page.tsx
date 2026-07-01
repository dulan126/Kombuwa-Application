'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { STREAMS, DISTRICTS } from '@/lib/constants';
import { districtMap } from '@/lib/utils';
import { isApiError } from '@/services/api-client';
import type { Stream, Grade } from '@/types';

export default function RegisterPage() {
  const router = useRouter();
  const { register, verifyOTP, demoLogin, isLoggedIn } = useAuth();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [stream, setStream] = useState<Stream | ''>('');
  const [grade, setGrade] = useState<Grade>('12');
  const [district, setDistrict] = useState('කොළඹ');
  const [school, setSchool] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otpMobile, setOtpMobile] = useState('');
  const [otpCode, setOtpCode] = useState('');

  // Redirect if already logged in
  React.useEffect(() => {
    if (isLoggedIn) router.push('/papers');
  }, [isLoggedIn, router]);

  const handleRegister = async () => {
    if (!stream) { showToast('ධාරාව select කරන්න!', 'warning'); return; }
    if (!name.trim()) { showToast('නම ඇතුළත් කරන්න', 'warning'); return; }
    const mobile = phone.trim();
    if (!mobile) { showToast('දු.ස. අංකය ඇතුළත් කරන්න', 'warning'); return; }
    if (!/^(?:0|\+94)7[0-9]{8}$/.test(mobile)) {
      showToast('දු.ස. ආකෘතිය: 07X XXX XXXX', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      const result = await register({
        mobile,
        name: name.trim(),
        password: crypto.randomUUID(),
        stream: stream as Stream,
        grade,
        district: districtMap(district),
        school: school || undefined,
        exam_year: 2026,
      });

      if (result.needsOTP) {
        setOtpMobile(result.mobile);
        setOtpStep(true);
        showToast('OTP යවන ලදී!', 'success');
      } else {
        showToast('සාදරයෙන් පිළිගනිමු! ✓', 'success');
        router.push('/papers');
      }
    } catch (err: unknown) {
      if (isApiError(err) && err.status === 409) {
        showToast('Mobile already registered', 'warning');
      } else {
        showToast('Error: ' + (isApiError(err) ? err.message : 'Try again'), 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otpCode.length !== 6) { showToast('OTP 6 ලකුණු ඇතුළත් කරන්න', 'warning'); return; }
    setIsLoading(true);
    try {
      await verifyOTP(otpMobile, otpCode, 'register');
      showToast('සාදරයෙන් පිළිගනිමු! ✓', 'success');
      router.push('/papers');
    } catch (err: unknown) {
      showToast('OTP වැරදිය: ' + (isApiError(err) ? err.message : ''), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (otpStep) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-58px)] px-4">
        <div className="bg-dark-2 border border-white/10 rounded-[var(--radius-base)] p-6 w-full max-w-[420px] animate-scale-in">
          <h1 className="text-lg font-bold mb-1">OTP සත්‍යාපනය</h1>
          <p className="text-[11px] text-text-muted mb-6">{otpMobile} වෙත 6-digit OTP යවන ලදී</p>
          <Input
            label="OTP කේතය"
            placeholder="000000"
            maxLength={6}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            className="text-center text-[1.4rem] tracking-[0.5rem]"
            autoFocus
          />
          <Button fullWidth className="mt-4" isLoading={isLoading} onClick={handleVerifyOTP}>
            සත්‍යාපනය කරන්න
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-58px)] px-4 py-8">
      <div className="bg-dark-2 border border-white/10 rounded-[var(--radius-base)] p-6 w-full max-w-[480px] animate-scale-in">
        <h1 className="text-lg font-bold mb-1">ලියාපදිංචිය</h1>
        <p className="text-[11px] text-text-muted mb-6">ධාරාව + ශ්‍රේණිය → ඔබේ subjects auto-filtered</p>

        {/* Name & Phone */}
        <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-2.5 mb-2.5">
          <Input label="නම" placeholder="ඔබේ නම" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="දු.ස. (+94)" placeholder="07X XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        {/* Grade */}
        <div className="mb-2.5">
          <label className="block text-[10.5px] text-text-muted mb-1.5">ශ්‍රේණිය</label>
          <div className="flex gap-2">
            <Button variant={grade === '12' ? 'primary' : 'outline'} className="flex-1" onClick={() => setGrade('12')}>
              12 ශ්‍රේණිය
            </Button>
            <Button variant={grade === '13' ? 'primary' : 'outline'} className="flex-1" onClick={() => setGrade('13')}>
              13 ශ්‍රේණිය
            </Button>
          </div>
        </div>

        {/* Stream */}
        <div className="mb-2.5">
          <label className="block text-[10.5px] text-text-muted mb-1.5">ධාරාව</label>
          <div className="grid grid-cols-5 max-sm:grid-cols-3 gap-2">
            {(Object.entries(STREAMS) as [Stream, typeof STREAMS[Stream]][]).map(([key, s]) => (
              <button
                key={key}
                onClick={() => setStream(key)}
                className={`border-[1.5px] rounded-[var(--radius-sm)] p-2.5 text-center cursor-pointer transition-all text-[11px] leading-tight ${
                  stream === key
                    ? 'border-gold bg-gold-bg'
                    : 'border-border-dim hover:border-gold'
                }`}
              >
                <span className="text-[22px] block mb-1">{s.icon}</span>
                {s.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* District & Year */}
        <div className="grid grid-cols-2 max-sm:grid-cols-1 gap-2.5 mb-2.5">
          <Select
            label="දිස්ත්‍රික්කය"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            options={DISTRICTS.map((d) => ({ value: d.si, label: d.si }))}
          />
          <Select
            label="විභාග වර්ෂය"
            options={[
              { value: '2026', label: '2026' },
              { value: '2027', label: '2027' },
            ]}
          />
        </div>

        {/* School */}
        <div className="mb-4">
          <Input label="පාසල" placeholder="ඔබේ පාසල" value={school} onChange={(e) => setSchool(e.target.value)} />
        </div>

        <Button fullWidth className="py-3 text-[13px]" isLoading={isLoading} onClick={handleRegister}>
          ලියාපදිංචිය ✓
        </Button>
      </div>
    </div>
  );
}
