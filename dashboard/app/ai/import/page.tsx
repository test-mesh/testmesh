'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AIImportRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/import?tab=spec');
  }, [router]);
  return null;
}
