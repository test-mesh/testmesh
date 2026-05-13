import { redirect } from 'next/navigation';
import { use } from 'react';

// The canvas editor is now the primary view at /flows/[id]
export default function FlowEditRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  redirect(`/flows/${id}`);
}
