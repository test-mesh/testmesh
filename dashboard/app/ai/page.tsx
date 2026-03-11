'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AIRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/flows');
  }, [router]);
  return null;
}
